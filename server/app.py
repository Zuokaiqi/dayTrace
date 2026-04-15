from flask import Flask, jsonify, request, send_from_directory, g, Response, stream_with_context
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from functools import wraps
from werkzeug.utils import secure_filename
import pymysql
import json, os, hashlib, secrets, time, hmac, base64, uuid
from PIL import Image
from openai import OpenAI
from dotenv import load_dotenv
import io

load_dotenv()

# 静态文件：USE_VUE=1 时用 Vue 构建产物，否则用旧版
USE_VUE = os.environ.get('USE_VUE', '1') == '1'
if USE_VUE:
    STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vue-app', 'dist'))
else:
    STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max upload

limiter = Limiter(key_func=get_remote_address, app=app, default_limits=[])

# Avatar upload directory
AVATAR_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'avatars'))
os.makedirs(AVATAR_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

_jwt_secret = os.environ.get('JWT_SECRET')
if not _jwt_secret:
    raise RuntimeError("JWT_SECRET environment variable is required")
JWT_SECRET = _jwt_secret
JWT_EXPIRE = 30 * 24 * 3600  # 30 days

# ─── Doubao (豆包) LLM Config ───
ARK_API_KEY = os.environ.get('ARK_API_KEY', '')
ARK_MODEL = os.environ.get('ARK_MODEL', '')  # e.g. ep-xxxx or doubao-1.5-pro-256k
ARK_BASE_URL = os.environ.get('ARK_BASE_URL', 'https://ark.cn-beijing.volces.com/api/v3')

ark_client = OpenAI(api_key=ARK_API_KEY, base_url=ARK_BASE_URL) if ARK_API_KEY else None

def _require_env(name):
    val = os.environ.get(name)
    if not val:
        raise RuntimeError(f"{name} environment variable is required")
    return val

DB_CONFIG = {
    'host': _require_env('DB_HOST'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': _require_env('DB_USER'),
    'password': _require_env('DB_PASS'),
    'database': _require_env('DB_NAME'),
    'charset': 'utf8mb4'
}

def get_db():
    return pymysql.connect(**DB_CONFIG)

# ─── Simple JWT (no dependency needed) ───

def jwt_encode(payload):
    header = base64.urlsafe_b64encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()).rstrip(b'=').decode()
    payload_b = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b'=').decode()
    sig_input = f"{header}.{payload_b}"
    sig = base64.urlsafe_b64encode(hmac.new(JWT_SECRET.encode(), sig_input.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
    return f"{header}.{payload_b}.{sig}"

def jwt_decode(token):
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return None
        header, payload_b, sig = parts
        sig_input = f"{header}.{payload_b}"
        expected = base64.urlsafe_b64encode(hmac.new(JWT_SECRET.encode(), sig_input.encode(), hashlib.sha256).digest()).rstrip(b'=').decode()
        if not hmac.compare_digest(sig, expected):
            return None
        # Fix padding
        pad = payload_b + '=' * (4 - len(payload_b) % 4)
        payload = json.loads(base64.urlsafe_b64decode(pad))
        if payload.get('exp', 0) < time.time():
            return None
        return payload
    except Exception:
        return None

def hash_password(password, salt=None):
    if not salt:
        salt = secrets.token_hex(16)
    h = hashlib.sha256((salt + password).encode()).hexdigest()
    return salt, h

def require_auth(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        if not auth.startswith('Bearer '):
            return jsonify({'error': '未登录'}), 401
        payload = jwt_decode(auth[7:])
        if not payload:
            return jsonify({'error': '登录已过期，请重新登录'}), 401
        g.user_id = payload['uid']
        g.username = payload.get('name', '')
        return f(*args, **kwargs)
    return decorated

# ─── Database Init ───

def init_db():
    cfg = {**DB_CONFIG}
    db_name = cfg.pop('database')
    conn = pymysql.connect(**cfg)
    cur = conn.cursor()
    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4")
    conn.select_db(db_name)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            salt VARCHAR(32) NOT NULL,
            password_hash VARCHAR(64) NOT NULL,
            nickname VARCHAR(50) DEFAULT NULL,
            avatar VARCHAR(20) DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    # Migrate: add nickname/avatar columns if missing
    try:
        cur.execute("ALTER TABLE users ADD COLUMN nickname VARCHAR(50) DEFAULT NULL")
    except:
        pass
    try:
        cur.execute("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL")
    except:
        pass
    # Migrate: widen avatar column for URL storage
    try:
        cur.execute("ALTER TABLE users MODIFY COLUMN avatar VARCHAR(255) DEFAULT NULL")
    except:
        pass
    cur.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INT NOT NULL,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT '',
            tag VARCHAR(50) NOT NULL DEFAULT 'work',
            date VARCHAR(20) NOT NULL DEFAULT '',
            `repeat` VARCHAR(20) DEFAULT NULL,
            repeat_end VARCHAR(20) DEFAULT NULL,
            excludes JSON DEFAULT NULL,
            plan_start VARCHAR(10) DEFAULT NULL,
            plan_end VARCHAR(10) DEFAULT NULL,
            actual_start VARCHAR(10) DEFAULT NULL,
            actual_end VARCHAR(10) DEFAULT NULL,
            actual_note TEXT DEFAULT NULL,
            PRIMARY KEY (user_id, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    # Migration: add repeat_end and excludes columns for existing databases
    try:
        cur.execute("ALTER TABLE events ADD COLUMN repeat_end VARCHAR(20) DEFAULT NULL AFTER `repeat`")
    except Exception:
        pass  # column already exists
    try:
        cur.execute("ALTER TABLE events ADD COLUMN excludes JSON DEFAULT NULL AFTER repeat_end")
    except Exception:
        pass  # column already exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS meta (
            user_id INT NOT NULL,
            k VARCHAR(50) NOT NULL,
            v TEXT,
            PRIMARY KEY (user_id, k)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id INT NOT NULL,
            user_id INT NOT NULL,
            data JSON NOT NULL,
            PRIMARY KEY (user_id, id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reflections (
            user_id INT NOT NULL,
            rkey VARCHAR(100) NOT NULL,
            val TEXT NOT NULL,
            PRIMARY KEY (user_id, rkey)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS links (
            user_id INT NOT NULL,
            data JSON NOT NULL,
            PRIMARY KEY (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ai_chats (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(255) NOT NULL DEFAULT '新对话',
            messages JSON NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ai_prompts (
            user_id INT NOT NULL,
            data JSON NOT NULL,
            PRIMARY KEY (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS goals (
            user_id INT NOT NULL,
            data JSON NOT NULL,
            PRIMARY KEY (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS announcements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            active TINYINT DEFAULT 1
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    # Migrate: add admin column to users
    try:
        cur.execute("ALTER TABLE users ADD COLUMN is_admin TINYINT DEFAULT 0")
    except:
        pass
    # Set default admin
    admin_username = os.environ.get('ADMIN_USERNAME', '')
    if admin_username:
        try:
            cur.execute("UPDATE users SET is_admin=1 WHERE username=%s", (admin_username,))
        except:
            pass
    conn.commit()
    cur.close()
    conn.close()

# ─── Static Files ───

@app.route('/')
def serve_index():
    return send_from_directory(STATIC_DIR, 'index.html')

if not USE_VUE:
    @app.route('/login')
    def serve_login():
        return send_from_directory(STATIC_DIR, 'login.html')

# Vue SPA catch-all: any non-API, non-file route returns index.html
if USE_VUE:
    @app.errorhandler(404)
    def spa_fallback(e):
        return send_from_directory(STATIC_DIR, 'index.html')


# ─── Auth API ───

@app.route('/api/register', methods=['POST'])
@limiter.limit("5 per minute")
def register():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or len(username) < 2:
        return jsonify({'error': '用户名至少2个字符'}), 400
    if not password or len(password) < 6:
        return jsonify({'error': '密码至少6个字符'}), 400

    salt, pw_hash = hash_password(password)
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO users (username, salt, password_hash) VALUES (%s, %s, %s)",
                     (username, salt, pw_hash))
        conn.commit()
        uid = cur.lastrowid
    except pymysql.err.IntegrityError:
        cur.close(); conn.close()
        return jsonify({'error': '用户名已存在'}), 409
    # Init meta
    cur.execute("REPLACE INTO meta (user_id, k, v) VALUES (%s, 'next_id', '1')", (uid,))
    cur.execute("REPLACE INTO meta (user_id, k, v) VALUES (%s, 'task_next_id', '1')", (uid,))
    conn.commit()
    cur.close(); conn.close()

    token = jwt_encode({'uid': uid, 'name': username, 'exp': time.time() + JWT_EXPIRE})
    return jsonify({'ok': True, 'token': token, 'username': username})


@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    data = request.get_json()
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    if not username or not password:
        return jsonify({'error': '请输入用户名和密码'}), 400

    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT * FROM users WHERE username=%s", (username,))
    user = cur.fetchone()
    cur.close(); conn.close()

    if not user:
        return jsonify({'error': '用户名或密码错误'}), 401
    _, pw_hash = hash_password(password, user['salt'])
    if pw_hash != user['password_hash']:
        return jsonify({'error': '用户名或密码错误'}), 401

    token = jwt_encode({'uid': user['id'], 'name': username, 'exp': time.time() + JWT_EXPIRE})
    return jsonify({'ok': True, 'token': token, 'username': username})


@app.route('/api/me', methods=['GET'])
@require_auth
def get_me():
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT id, username, nickname, avatar, is_admin, created_at FROM users WHERE id=%s", (g.user_id,))
    user = cur.fetchone()
    cur.close(); conn.close()
    if not user:
        return jsonify({'uid': g.user_id, 'username': g.username})
    return jsonify({
        'uid': user['id'],
        'username': user['username'],
        'nickname': user.get('nickname') or '',
        'avatar': user.get('avatar') or '',
        'is_admin': bool(user.get('is_admin')),
        'created_at': str(user['created_at']) if user.get('created_at') else ''
    })


@app.route('/api/profile', methods=['PUT'])
@require_auth
def update_profile():
    data = request.get_json()
    nickname = (data.get('nickname') or '').strip()[:50]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET nickname=%s WHERE id=%s", (nickname or None, g.user_id))
    conn.commit()
    cur.close(); conn.close()
    return jsonify({'ok': True, 'nickname': nickname})


@app.route('/api/avatar', methods=['POST'])
@require_auth
def upload_avatar():
    if 'file' not in request.files:
        return jsonify({'error': '请选择图片'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': '请选择图片'}), 400
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({'error': '仅支持 png/jpg/gif/webp 格式'}), 400

    try:
        img = Image.open(f.stream)
        img.verify()
        f.stream.seek(0)
        img = Image.open(f.stream)
    except Exception:
        return jsonify({'error': '无效的图片文件'}), 400

    # Resize to max 256x256, convert to webp
    img.thumbnail((256, 256), Image.LANCZOS)
    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGBA')
    else:
        img = img.convert('RGB')

    filename = f"{g.user_id}_{uuid.uuid4().hex[:8]}.webp"
    buf = io.BytesIO()
    img.save(buf, format='WEBP', quality=85)
    buf.seek(0)

    # Delete old avatar files for this user
    for old in os.listdir(AVATAR_DIR):
        if old.startswith(f"{g.user_id}_"):
            try:
                os.remove(os.path.join(AVATAR_DIR, old))
            except OSError:
                pass

    filepath = os.path.join(AVATAR_DIR, filename)
    with open(filepath, 'wb') as out:
        out.write(buf.read())

    avatar_url = f"/api/avatars/{filename}"

    # Update DB
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET avatar=%s WHERE id=%s", (avatar_url, g.user_id))
    conn.commit()
    cur.close()
    conn.close()

    return jsonify({'ok': True, 'avatar': avatar_url})


@app.route('/api/avatars/<path:filename>', methods=['GET'])
def serve_avatar(filename):
    safe = secure_filename(filename)
    return send_from_directory(AVATAR_DIR, safe, max_age=86400)


@app.route('/api/password', methods=['PUT'])
@require_auth
def change_password():
    data = request.get_json()
    old_pw = data.get('old_password') or ''
    new_pw = data.get('new_password') or ''
    if not old_pw or not new_pw:
        return jsonify({'error': '请填写完整'}), 400
    if len(new_pw) < 6:
        return jsonify({'error': '新密码至少6个字符'}), 400
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT salt, password_hash FROM users WHERE id=%s", (g.user_id,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        return jsonify({'error': '用户不存在'}), 404
    _, old_hash = hash_password(old_pw, user['salt'])
    if old_hash != user['password_hash']:
        cur.close(); conn.close()
        return jsonify({'error': '原密码错误'}), 403
    new_salt, new_hash = hash_password(new_pw)
    cur.execute("UPDATE users SET salt=%s, password_hash=%s WHERE id=%s", (new_salt, new_hash, g.user_id))
    conn.commit()
    cur.close(); conn.close()
    return jsonify({'ok': True})

# ─── Events API (with user isolation) ───

@app.route('/api/events', methods=['GET'])
@require_auth
def get_events():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT * FROM events WHERE user_id=%s ORDER BY date, plan_start", (uid,))
    rows = cur.fetchall()
    cur.execute("SELECT v FROM meta WHERE user_id=%s AND k='next_id'", (uid,))
    meta = cur.fetchone()
    next_id = int(meta['v']) if meta else 1
    cur.close(); conn.close()

    events = []
    for r in rows:
        ev = {'id': r['id'], 'title': r['title'], 'tag': r['tag'],
              'date': r['date'], 'repeat': r['repeat']}
        if r.get('repeat_end'):
            ev['repeatEnd'] = r['repeat_end']
        if r.get('excludes'):
            exc = r['excludes']
            ev['excludes'] = json.loads(exc) if isinstance(exc, str) else exc
        ev['plan'] = {'start': r['plan_start'], 'end': r['plan_end']} if r['plan_start'] else None
        ev['actual'] = {'start': r['actual_start'], 'end': r['actual_end'], 'note': r['actual_note'] or ''} if r['actual_start'] else None
        events.append(ev)
    return jsonify({'events': events, 'nextId': next_id})


@app.route('/api/events', methods=['POST'])
@require_auth
def save_events():
    uid = g.user_id
    data = request.get_json()
    if not data or 'events' not in data:
        return jsonify({'error': '无效数据'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM events WHERE user_id=%s", (uid,))
    for ev in data['events']:
        plan = ev.get('plan') or {}
        actual = ev.get('actual') or {}
        excludes = ev.get('excludes')
        excludes_json = json.dumps(excludes) if excludes else None
        cur.execute(
            "INSERT INTO events (id,user_id,title,tag,date,`repeat`,repeat_end,excludes,plan_start,plan_end,actual_start,actual_end,actual_note) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (ev['id'], uid, ev.get('title',''), ev.get('tag','work'), ev.get('date',''),
             ev.get('repeat'), ev.get('repeatEnd'), excludes_json,
             plan.get('start'), plan.get('end'),
             actual.get('start'), actual.get('end'), actual.get('note'))
        )
    cur.execute("REPLACE INTO meta (user_id,k,v) VALUES (%s,'next_id',%s)", (uid, str(data.get('nextId', 1))))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True, 'count': len(data['events'])})


# ─── Tasks API (with user isolation) ───

@app.route('/api/tasks', methods=['GET'])
@require_auth
def get_tasks():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT * FROM tasks WHERE user_id=%s ORDER BY id", (uid,))
    rows = cur.fetchall()
    cur.execute("SELECT v FROM meta WHERE user_id=%s AND k='task_next_id'", (uid,))
    meta = cur.fetchone()
    task_next_id = int(meta['v']) if meta else 1
    cur.close(); conn.close()

    tasks = []
    for r in rows:
        t = json.loads(r['data']) if isinstance(r['data'], str) else r['data']
        t['id'] = r['id']
        tasks.append(t)
    return jsonify({'tasks': tasks, 'taskNextId': task_next_id})


@app.route('/api/tasks', methods=['POST'])
@require_auth
def save_tasks():
    uid = g.user_id
    data = request.get_json()
    if not data or 'tasks' not in data:
        return jsonify({'error': '无效数据'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE user_id=%s", (uid,))
    for t in data['tasks']:
        cur.execute("INSERT INTO tasks (id, user_id, data) VALUES (%s, %s, %s)",
                     (t.get('id', 0), uid, json.dumps(t, ensure_ascii=False)))
    cur.execute("REPLACE INTO meta (user_id,k,v) VALUES (%s,'task_next_id',%s)", (uid, str(data.get('taskNextId', 1))))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True, 'count': len(data['tasks'])})


# ─── Reflections API (with user isolation) ───

@app.route('/api/reflections', methods=['GET'])
@require_auth
def get_reflections():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT rkey, val FROM reflections WHERE user_id=%s", (uid,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return jsonify({r['rkey']: r['val'] for r in rows})


@app.route('/api/reflections', methods=['POST'])
@require_auth
def save_reflections():
    uid = g.user_id
    data = request.get_json()
    if not data or not isinstance(data, dict):
        return jsonify({'error': '无效数据'}), 400

    conn = get_db()
    cur = conn.cursor()
    for key, val in data.items():
        cur.execute("REPLACE INTO reflections (user_id, rkey, val) VALUES (%s, %s, %s)", (uid, key, val))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True, 'count': len(data)})


# ─── Links API (with user isolation) ───

@app.route('/api/links', methods=['GET'])
@require_auth
def get_links():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT data FROM links WHERE user_id=%s", (uid,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if row:
        links = json.loads(row['data']) if isinstance(row['data'], str) else row['data']
        return jsonify({'links': links})
    return jsonify({'links': []})


@app.route('/api/links', methods=['POST'])
@require_auth
def save_links():
    uid = g.user_id
    data = request.get_json()
    if not data or 'links' not in data:
        return jsonify({'error': '无效数据'}), 400

    conn = get_db()
    cur = conn.cursor()
    cur.execute("REPLACE INTO links (user_id, data) VALUES (%s, %s)",
                (uid, json.dumps(data['links'], ensure_ascii=False)))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True, 'count': len(data['links'])})


# ─── AI Chats API ───

@app.route('/api/ai/chats', methods=['GET'])
@require_auth
def get_ai_chats():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT id, title, updated_at FROM ai_chats WHERE user_id=%s ORDER BY updated_at DESC", (uid,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    for r in rows:
        r['updated_at'] = r['updated_at'].isoformat() if r['updated_at'] else None
    return jsonify({'chats': rows})

@app.route('/api/ai/chats/<int:chat_id>', methods=['GET'])
@require_auth
def get_ai_chat(chat_id):
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT id, title, messages FROM ai_chats WHERE id=%s AND user_id=%s", (chat_id, uid))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return jsonify({'error': '对话不存在'}), 404
    row['messages'] = json.loads(row['messages']) if isinstance(row['messages'], str) else row['messages']
    return jsonify(row)

@app.route('/api/ai/chats', methods=['POST'])
@require_auth
def save_ai_chat():
    uid = g.user_id
    data = request.get_json()
    if not data:
        return jsonify({'error': '无效数据'}), 400
    conn = get_db()
    cur = conn.cursor()
    chat_id = data.get('id')
    title = data.get('title', '新对话')
    messages = json.dumps(data.get('messages', []), ensure_ascii=False)
    if chat_id:
        cur.execute("UPDATE ai_chats SET title=%s, messages=%s WHERE id=%s AND user_id=%s",
                    (title, messages, chat_id, uid))
    else:
        cur.execute("INSERT INTO ai_chats (user_id, title, messages) VALUES (%s, %s, %s)",
                    (uid, title, messages))
        chat_id = cur.lastrowid
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True, 'id': chat_id})

@app.route('/api/ai/chats/<int:chat_id>', methods=['DELETE'])
@require_auth
def delete_ai_chat(chat_id):
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM ai_chats WHERE id=%s AND user_id=%s", (chat_id, uid))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})

# ─── AI Prompts API ───

@app.route('/api/ai/prompts', methods=['GET'])
@require_auth
def get_ai_prompts():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT data FROM ai_prompts WHERE user_id=%s", (uid,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if row:
        prompts = json.loads(row['data']) if isinstance(row['data'], str) else row['data']
        return jsonify({'prompts': prompts})
    return jsonify({'prompts': []})

@app.route('/api/ai/prompts', methods=['POST'])
@require_auth
def save_ai_prompts():
    uid = g.user_id
    data = request.get_json()
    if not data or 'prompts' not in data:
        return jsonify({'error': '无效数据'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("REPLACE INTO ai_prompts (user_id, data) VALUES (%s, %s)",
                (uid, json.dumps(data['prompts'], ensure_ascii=False)))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})


# ─── Goals API (月任务 + 周任务) ───

@app.route('/api/goals', methods=['GET'])
@require_auth
def get_goals():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT data FROM goals WHERE user_id=%s", (uid,))
    row = cur.fetchone()
    cur.close(); conn.close()
    if row:
        d = json.loads(row['data']) if isinstance(row['data'], str) else row['data']
        return jsonify(d)
    return jsonify({'monthlyGoals': [], 'weeklyTasks': [], 'mNextId': 1, 'wNextId': 1})

@app.route('/api/goals', methods=['POST'])
@require_auth
def save_goals():
    uid = g.user_id
    data = request.get_json()
    if not data:
        return jsonify({'error': '无效数据'}), 400
    conn = get_db()
    cur = conn.cursor()
    cur.execute("REPLACE INTO goals (user_id, data) VALUES (%s, %s)",
                (uid, json.dumps(data, ensure_ascii=False)))
    conn.commit(); cur.close(); conn.close()
    return jsonify({'ok': True})


# ─── Announcements API ───

@app.route('/api/announcements', methods=['GET'])
@require_auth
def get_announcements():
    limit = request.args.get('limit', 20, type=int)
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT id, content, created_at FROM announcements WHERE active=1 ORDER BY id DESC LIMIT %s", (limit,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    for r in rows:
        r['created_at'] = r['created_at'].isoformat() if r['created_at'] else None
    return jsonify({'announcements': rows})


@app.route('/api/announcements', methods=['POST'])
@require_auth
def post_announcement():
    # Check admin
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT is_admin FROM users WHERE id=%s", (g.user_id,))
    user = cur.fetchone()
    if not user or not user.get('is_admin'):
        cur.close(); conn.close()
        return jsonify({'error': '无权限'}), 403
    data = request.get_json()
    content = (data.get('content') or '').strip()
    if not content:
        cur.close(); conn.close()
        return jsonify({'error': '内容不能为空'}), 400
    cur.execute("INSERT INTO announcements (content) VALUES (%s)", (content,))
    conn.commit()
    aid = cur.lastrowid
    cur.close(); conn.close()
    return jsonify({'ok': True, 'id': aid})


@app.route('/api/announcements/<int:aid>', methods=['DELETE'])
@require_auth
def delete_announcement(aid):
    conn = get_db()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    cur.execute("SELECT is_admin FROM users WHERE id=%s", (g.user_id,))
    user = cur.fetchone()
    if not user or not user.get('is_admin'):
        cur.close(); conn.close()
        return jsonify({'error': '无权限'}), 403
    cur.execute("UPDATE announcements SET active=0 WHERE id=%s", (aid,))
    conn.commit()
    cur.close(); conn.close()
    return jsonify({'ok': True})


# ─── Feedback API ───

FEEDBACK_TO = os.environ.get('FEEDBACK_EMAIL', '')
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.163.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 465))
SMTP_USER = os.environ.get('SMTP_USER', '')
SMTP_PASS = os.environ.get('SMTP_PASS', '')

@app.route('/api/feedback', methods=['POST'])
@require_auth
def submit_feedback():
    content = request.form.get('content', '').strip()
    if not content:
        return jsonify({'error': '请输入反馈内容'}), 400

    # Collect uploaded images
    images = []
    for key in request.files:
        f = request.files[key]
        if f and f.filename:
            images.append((f.filename, f.read(), f.content_type or 'image/png'))

    # Save to DB
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            username VARCHAR(50),
            content TEXT NOT NULL,
            image_count INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    cur.execute("INSERT INTO feedback (user_id, username, content, image_count) VALUES (%s, %s, %s, %s)",
                (g.user_id, g.username, content, len(images)))
    conn.commit()
    cur.close()
    conn.close()

    # Send email
    if SMTP_USER and SMTP_PASS:
        try:
            import smtplib
            from email.mime.multipart import MIMEMultipart
            from email.mime.text import MIMEText
            from email.mime.image import MIMEImage

            msg = MIMEMultipart()
            msg['From'] = SMTP_USER
            msg['To'] = FEEDBACK_TO
            msg['Subject'] = f'[DayTrace] 用户反馈 - {g.username}'

            body = f"用户: {g.username} (ID: {g.user_id})\n\n{content}"
            msg.attach(MIMEText(body, 'plain', 'utf-8'))

            for fname, fdata, ftype in images:
                maintype = ftype.split('/')[0] if '/' in ftype else 'image'
                subtype = ftype.split('/')[1] if '/' in ftype else 'png'
                img = MIMEImage(fdata, _subtype=subtype)
                img.add_header('Content-Disposition', 'attachment', filename=fname)
                msg.attach(img)

            with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as s:
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        except Exception as e:
            # Email failed but feedback is saved in DB
            print(f"Feedback email error: {e}")

    return jsonify({'ok': True})


# ─── Claim Legacy Data (one-time migration) ───

@app.route('/api/claim-legacy', methods=['POST'])
@require_auth
def claim_legacy():
    uid = g.user_id
    conn = get_db()
    cur = conn.cursor()
    claimed = []
    try:
        db = DB_CONFIG['database']
        cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME='events_old'", (db,))
        if cur.fetchone():
            cur.execute("INSERT INTO events (id,user_id,title,tag,date,`repeat`,plan_start,plan_end,actual_start,actual_end,actual_note) SELECT id,%s,title,tag,date,`repeat`,plan_start,plan_end,actual_start,actual_end,actual_note FROM events_old", (uid,))
            claimed.append(f"events: {cur.rowcount}")
            cur.execute("DROP TABLE events_old")
        cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME='meta_old'", (db,))
        if cur.fetchone():
            cur.execute("INSERT IGNORE INTO meta (user_id,k,v) SELECT %s,k,v FROM meta_old", (uid,))
            claimed.append(f"meta: {cur.rowcount}")
            cur.execute("DROP TABLE meta_old")
        cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME='tasks_old'", (db,))
        if cur.fetchone():
            cur.execute("INSERT INTO tasks (id,user_id,data) SELECT id,%s,data FROM tasks_old", (uid,))
            claimed.append(f"tasks: {cur.rowcount}")
            cur.execute("DROP TABLE tasks_old")
        cur.execute("SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=%s AND TABLE_NAME='reflections_old'", (db,))
        if cur.fetchone():
            cur.execute("INSERT INTO reflections (user_id,rkey,val) SELECT %s,rkey,val FROM reflections_old", (uid,))
            claimed.append(f"reflections: {cur.rowcount}")
            cur.execute("DROP TABLE reflections_old")
        conn.commit()
    except Exception as e:
        conn.rollback()
        cur.close(); conn.close()
        return jsonify({'error': str(e)}), 500
    cur.close(); conn.close()
    if not claimed:
        return jsonify({'ok': True, 'msg': '没有找到旧数据'})
    return jsonify({'ok': True, 'claimed': claimed})


# ─── AI Chat (LLM proxy with function calling) ───

AI_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "addEvent",
            "description": "在日历上创建一个新的日程事件",
            "parameters": {
                "type": "object",
                "properties": {
                    "title":  {"type": "string", "description": "事件标题"},
                    "tag":    {"type": "string", "enum": ["work", "personal", "admin"], "description": "标签: work=工作, personal=生活, admin=事务"},
                    "date":   {"type": "string", "description": "日期 YYYY-MM-DD"},
                    "start":  {"type": "string", "description": "开始时间 HH:MM (24h)"},
                    "end":    {"type": "string", "description": "结束时间 HH:MM (24h)"},
                    "repeat": {"type": "string", "enum": ["daily", "weekday", "weekly"], "description": "重复规则，不重复则不传"}
                },
                "required": ["title", "tag", "date", "start", "end"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "updateEvent",
            "description": "修改一个已存在的日程事件（调整时间、改标题、改标签等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "eventId": {"type": "integer", "description": "事件ID"},
                    "title":   {"type": "string", "description": "新标题（不改则不传）"},
                    "tag":     {"type": "string", "enum": ["work", "personal", "admin"]},
                    "date":    {"type": "string", "description": "新日期 YYYY-MM-DD"},
                    "start":   {"type": "string", "description": "新开始时间 HH:MM"},
                    "end":     {"type": "string", "description": "新结束时间 HH:MM"}
                },
                "required": ["eventId"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "deleteEvent",
            "description": "删除一个日程事件",
            "parameters": {
                "type": "object",
                "properties": {
                    "eventId": {"type": "integer", "description": "要删除的事件ID"}
                },
                "required": ["eventId"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "batchAddEvents",
            "description": "批量创建多个日程事件（用于智能排期等场景）",
            "parameters": {
                "type": "object",
                "properties": {
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": {"type": "string"},
                                "tag":   {"type": "string", "enum": ["work", "personal", "admin"]},
                                "date":  {"type": "string"},
                                "start": {"type": "string"},
                                "end":   {"type": "string"}
                            },
                            "required": ["title", "tag", "date", "start", "end"]
                        },
                        "description": "要创建的事件列表"
                    }
                },
                "required": ["events"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "addTask",
            "description": "创建一个DDL任务（待办事项）",
            "parameters": {
                "type": "object",
                "properties": {
                    "title":    {"type": "string", "description": "任务标题"},
                    "tag":      {"type": "string", "enum": ["work", "personal", "admin"], "description": "标签"},
                    "deadline": {"type": "string", "description": "截止日期 YYYY-MM-DD，可选"}
                },
                "required": ["title", "tag"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "updateTask",
            "description": "修改一个已存在的DDL任务（改标题、调整截止日期、改标签等）",
            "parameters": {
                "type": "object",
                "properties": {
                    "taskId":   {"type": "integer", "description": "任务ID"},
                    "title":    {"type": "string", "description": "新标题（不改则不传）"},
                    "tag":      {"type": "string", "enum": ["work", "personal", "admin"]},
                    "deadline": {"type": "string", "description": "新截止日期 YYYY-MM-DD，传空字符串表示移除截止日期"},
                    "done":     {"type": "boolean", "description": "是否完成"}
                },
                "required": ["taskId"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "deleteTask",
            "description": "删除一个DDL任务",
            "parameters": {
                "type": "object",
                "properties": {
                    "taskId": {"type": "integer", "description": "要删除的任务ID"}
                },
                "required": ["taskId"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "toggleTask",
            "description": "切换一个DDL任务的完成状态",
            "parameters": {
                "type": "object",
                "properties": {
                    "taskId": {"type": "integer", "description": "任务ID"},
                    "done":   {"type": "boolean", "description": "true=标记完成, false=取消完成"}
                },
                "required": ["taskId", "done"]
            }
        }
    }
]

def _format_events_for_date(events):
    """Format a single day's events into readable lines"""
    if not events:
        return '  （无日程）'
    lines = []
    for e in events:
        plan = e.get('plan') or {}
        actual = e.get('actual') or {}
        plan_str = f"计划 {plan.get('start','?')}—{plan.get('end','?')}" if plan.get('start') else '无计划时间'
        actual_str = f"，实际 {actual.get('start','?')}—{actual.get('end','?')}" if actual.get('start') else ''
        repeat_str = f"，重复:{e.get('repeat')}" if e.get('repeat') else ''
        lines.append(f"  - [id={e['id']}] {e.get('title','')}（{e.get('tag','work')}）| {plan_str}{actual_str}{repeat_str}")
    return '\n'.join(lines)

def _format_events_by_date(events_by_date, today):
    """Format multi-day events grouped by date"""
    if not events_by_date:
        return '（暂无日程）'
    # Weekday names in Chinese
    weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
    lines = []
    for dk in sorted(events_by_date.keys()):
        from datetime import datetime
        try:
            d = datetime.strptime(dk, '%Y-%m-%d')
            wd = weekdays[d.weekday()]
        except Exception:
            wd = ''
        if dk == today:
            label = f"📌 {dk}（{wd}·今天）"
        else:
            label = f"{dk}（{wd}）"
        lines.append(label)
        lines.append(_format_events_for_date(events_by_date[dk]))
    return '\n'.join(lines)

def build_system_prompt(context):
    today = context.get('today', '')
    current_time = context.get('currentTime', '')
    view_date = context.get('viewDate', today)
    # Support both new multi-day format and legacy single-day format
    events_by_date = context.get('eventsByDate')
    if events_by_date:
        events_readable = _format_events_by_date(events_by_date, today)
    else:
        events_readable = _format_events_for_date(context.get('todayEvents', []))
    # Append summary counts for dates outside detail range
    events_summary = context.get('eventsSummary')
    if events_summary:
        from datetime import datetime
        weekdays_s = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
        summary_parts = []
        for dk in sorted(events_summary.keys()):
            try:
                wd = weekdays_s[datetime.strptime(dk, '%Y-%m-%d').weekday()]
            except Exception:
                wd = ''
            summary_parts.append(f"  {dk}（{wd}）: {events_summary[dk]}个日程")
        events_readable += "\n\n其他日期（仅数量）：\n" + '\n'.join(summary_parts)

    # Support both new multi-day tasks and legacy single-day format
    tasks_by_date = context.get('tasksByDate')
    if tasks_by_date:
        tasks_lines = []
        for dk in sorted(tasks_by_date.keys()):
            items = tasks_by_date[dk]
            if not items:
                continue
            label = f"📌 {dk}" if dk == today else dk
            item_strs = ', '.join(f"{'✅' if t.get('done') else '⬜'}[id={t.get('taskId','?')}]{t.get('label','')}" for t in items)
            tasks_lines.append(f"  {label}: {item_strs}")
        tasks_str = '\n'.join(tasks_lines) if tasks_lines else '（无DDL任务）'
    else:
        tasks_str = json.dumps(context.get('todayTasks', []), ensure_ascii=False, indent=None)
    # Unscheduled tasks (no deadline set)
    unscheduled = context.get('unscheduledTasks', [])
    if unscheduled:
        unsch_strs = ', '.join(f"[id={t.get('taskId','?')}]{t.get('title','')}" for t in unscheduled)
        tasks_str += f"\n  未设截止日期的任务: {unsch_strs}"
    view_hint = f"\n用户当前正在查看的日期：{view_date}（如果用户说'这天'或指代不明确的日期，优先理解为此日期）" if view_date != today else ""
    return f"""你是 DayTrace 日程管理助手。用户通过自然语言描述日程操作，你需要理解意图并调用对应的工具函数。

当前日期：{today}
当前时间：{current_time}{view_hint}

用户近期日程（详情 + 更远日期概览）：
{events_readable}

用户近期DDL任务（可用于智能排期参考）：
{tasks_str}

概念说明：
- 日程事件（Event）：有具体时间段的日历条目，显示在日视图上
  - plan（计划时间）：用户预先安排的时间段，显示在日历左列
  - actual（实际时间）：实际执行的时间段，显示在日历右列
  - 创建日程时设置的 start/end 对应的是 plan 计划时间
  - 冲突检查应基于 plan 计划时间
- DDL任务（Task）：待办事项，有可选的截止日期（deadline），显示在对应日期的任务区域
  - 与日程事件是不同的概念：任务没有具体的开始/结束时间，只有截止日期
  - 用户说"添加任务"、"加个DDL"、"创建待办"时用 addTask
  - 用户说"安排日程"、"添加事件"、"几点到几点"时用 addEvent

规则：
- tag 只能是 work(工作)、personal(生活)、admin(事务) 之一，根据内容自动判断
- 时间格式为 HH:MM（24小时制），日期为 YYYY-MM-DD
- 如果用户说"下午2点"，转换为 "14:00"；"晚上8点"转为 "20:00"
- 如果用户没指定日期，默认为今天 {today}
- 如果用户没指定时长，默认安排1小时
- 如果用户想安排"现在"之后的日程，参考当前时间 {current_time} 来选择合适的开始时间
- 避免与已有日程的计划时间冲突，如有冲突请提醒用户
- 修改/删除事件时，根据标题和时间从已有日程中匹配出 eventId
- 重要：调整日程时间时，使用 updateEvent 修改原事件，不要删除后重新创建
- 重要：如果对话历史中有 [已执行: 添加事件 id=X ...] 这样的记录，说明你之前创建了该事件，后续调整时应使用该 id
- 重要：用户可能引用"明天"、"后天"、"昨天"等日期，你可以从近期日程中查找对应的事件
- 修改/删除任务时，根据标题从已有任务列表中匹配出 taskId
- 回复简洁友好，使用中文，不要解释工具调用本身，不要在回复中暴露内部ID（如 id=61）给用户
- 调用工具时，请同时输出简短的确认文字（如"好的，帮你安排了"），这样用户可以更快看到反馈
- 如果用户的请求不涉及日程或任务操作（只是闲聊或提问），直接回复文字即可，不需要调用工具"""


def _truncate_history(history, max_tokens=4000):
    """Keep first user+assistant pair (initial intent) + most recent messages within token budget."""
    if not history:
        return []
    def _msg_tokens(c):
        cjk = sum(1 for ch in c if '\u4e00' <= ch <= '\u9fff' or '\u3000' <= ch <= '\u303f' or '\uff00' <= ch <= '\uffef')
        return int(cjk * 1.2 + (len(c) - cjk) * 0.3)
    def est_tokens(msgs):
        return sum(_msg_tokens(m.get('content', '') or '') for m in msgs)
    if est_tokens(history) <= max_tokens:
        return history
    # Always keep first user+assistant pair
    first_pair = history[:min(2, len(history))]
    if len(history) <= 2:
        return history
    remaining = history[len(first_pair):]
    budget = max_tokens - est_tokens(first_pair)
    # Fill from the end (most recent messages matter most)
    kept = []
    for m in reversed(remaining):
        cost = _msg_tokens(m.get('content', '') or '')
        if kept and budget - cost < 0:
            break
        kept.insert(0, m)
        budget -= cost
    return first_pair + kept


@app.route('/api/ai/chat/stream', methods=['POST'])
@require_auth
def ai_chat_stream():
    if not ark_client:
        return jsonify({'error': '未配置 AI 服务，请设置 ARK_API_KEY 和 ARK_MODEL 环境变量'}), 503

    data = request.get_json()
    if not data or 'message' not in data:
        return jsonify({'error': '缺少 message 字段'}), 400

    user_msg = data['message']
    context = data.get('context', {})
    history = data.get('history', [])  # [{role, content}, ...]

    system_prompt = build_system_prompt(context)

    messages = [{"role": "system", "content": system_prompt}]
    # Smart history truncation: keep first pair + most recent, within token budget
    history = _truncate_history(history, max_tokens=4000)
    for m in history:
        messages.append({"role": m["role"], "content": m["content"]})
    messages.append({"role": "user", "content": user_msg})

    def generate():
        try:
            # First call: may return tool calls or text
            response = ark_client.chat.completions.create(
                model=ARK_MODEL,
                messages=messages,
                tools=AI_TOOLS,
                stream=True
            )

            # Accumulate streamed response
            full_content = ""
            tool_calls_acc = {}  # index -> {id, name, arguments_str}

            for chunk in response:
                delta = chunk.choices[0].delta if chunk.choices else None
                if not delta:
                    continue

                # Stream text content
                if delta.content:
                    full_content += delta.content
                    yield f"data: {json.dumps({'type': 'text', 'content': delta.content}, ensure_ascii=False)}\n\n"

                # Accumulate tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        idx = tc.index
                        if idx not in tool_calls_acc:
                            tool_calls_acc[idx] = {"id": tc.id or "", "name": "", "arguments": ""}
                        if tc.id:
                            tool_calls_acc[idx]["id"] = tc.id
                        if tc.function:
                            if tc.function.name:
                                tool_calls_acc[idx]["name"] = tc.function.name
                            if tc.function.arguments:
                                tool_calls_acc[idx]["arguments"] += tc.function.arguments

            # If there are tool calls, send them as actions
            if tool_calls_acc:
                actions = []
                for idx in sorted(tool_calls_acc.keys()):
                    tc = tool_calls_acc[idx]
                    try:
                        args = json.loads(tc["arguments"])
                    except json.JSONDecodeError:
                        args = {}
                    actions.append({"type": tc["name"], "params": args})

                yield f"data: {json.dumps({'type': 'actions', 'actions': actions}, ensure_ascii=False)}\n\n"

                # Only make a second LLM call if the first one didn't produce text
                if not full_content.strip():
                    tool_messages = list(messages)
                    assistant_msg = {"role": "assistant", "content": full_content or None, "tool_calls": []}
                    for idx in sorted(tool_calls_acc.keys()):
                        tc = tool_calls_acc[idx]
                        assistant_msg["tool_calls"].append({
                            "id": tc["id"],
                            "type": "function",
                            "function": {"name": tc["name"], "arguments": tc["arguments"]}
                        })
                    tool_messages.append(assistant_msg)

                    for idx in sorted(tool_calls_acc.keys()):
                        tc = tool_calls_acc[idx]
                        try:
                            tc_args = json.loads(tc["arguments"])
                        except Exception:
                            tc_args = {}
                        result = {"success": True}
                        name = tc["name"]
                        if name == "addEvent":
                            result["message"] = f"已创建事件「{tc_args.get('title','')}」{tc_args.get('date','')} {tc_args.get('start','')}-{tc_args.get('end','')}"
                        elif name == "updateEvent":
                            parts = []
                            if tc_args.get('title'): parts.append(f"标题→{tc_args['title']}")
                            if tc_args.get('start') or tc_args.get('end'): parts.append(f"时间→{tc_args.get('start','?')}-{tc_args.get('end','?')}")
                            if tc_args.get('date'): parts.append(f"日期→{tc_args['date']}")
                            result["message"] = f"已修改事件 id={tc_args.get('eventId','')} {'，'.join(parts)}"
                        elif name == "deleteEvent":
                            result["message"] = f"已删除事件 id={tc_args.get('eventId','')}"
                        elif name == "batchAddEvents":
                            evts = tc_args.get('events', [])
                            titles = '、'.join(e.get('title','') for e in evts[:5])
                            result["message"] = f"已批量创建 {len(evts)} 个事件：{titles}"
                        elif name == "addTask":
                            dl = f" 截止{tc_args.get('deadline','')}" if tc_args.get('deadline') else ''
                            result["message"] = f"已创建任务「{tc_args.get('title','')}」{dl}"
                        elif name == "updateTask":
                            parts = []
                            if tc_args.get('title'): parts.append(f"标题→{tc_args['title']}")
                            if tc_args.get('deadline') is not None: parts.append(f"截止→{tc_args['deadline'] or '无'}")
                            if tc_args.get('done') is not None: parts.append('标记完成' if tc_args['done'] else '取消完成')
                            result["message"] = f"已修改任务 id={tc_args.get('taskId','')} {'，'.join(parts)}"
                        elif name == "deleteTask":
                            result["message"] = f"已删除任务 id={tc_args.get('taskId','')}"
                        elif name == "toggleTask":
                            done = tc_args.get('done', True)
                            result["message"] = f"已{'完成' if done else '取消完成'}任务 id={tc_args.get('taskId','')}"
                        tool_messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": json.dumps(result, ensure_ascii=False)
                        })

                    followup = ark_client.chat.completions.create(
                        model=ARK_MODEL,
                        messages=tool_messages,
                        stream=True
                    )
                    for chunk in followup:
                        delta = chunk.choices[0].delta if chunk.choices else None
                        if delta and delta.content:
                            yield f"data: {json.dumps({'type': 'text', 'content': delta.content}, ensure_ascii=False)}\n\n"

            yield "data: {\"type\": \"done\"}\n\n"

        except Exception as e:
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'type': 'error', 'error': 'AI 服务暂时不可用，请稍后重试'}, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'}
    )


if __name__ == '__main__':
    print("Initializing database...")
    init_db()
    print("Database ready.")
    port = int(os.environ.get('PORT', 5000))
    if ARK_API_KEY:
        print(f"AI enabled: model={ARK_MODEL}")
    else:
        print("AI disabled: set ARK_API_KEY and ARK_MODEL to enable")
    print(f"DayTrace running on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
