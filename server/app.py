from flask import Flask, jsonify, request, send_from_directory, g
from flask_cors import CORS
from functools import wraps
from werkzeug.utils import secure_filename
import pymysql
import json, os, hashlib, secrets, time, hmac, base64, uuid
from PIL import Image
import io

# 静态文件：USE_VUE=1 时用 Vue 构建产物，否则用旧版
USE_VUE = os.environ.get('USE_VUE', '1') == '1'
if USE_VUE:
    STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'vue-app', 'dist'))
else:
    STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024  # 5MB max upload

# Avatar upload directory
AVATAR_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), 'avatars'))
os.makedirs(AVATAR_DIR, exist_ok=True)
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

JWT_SECRET = os.environ.get('JWT_SECRET', 'daytrace_secret_key_change_in_prod')
JWT_EXPIRE = 30 * 24 * 3600  # 30 days

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'rm-uf67s8149db41358eyo.mysql.rds.aliyuncs.com'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'rainbow'),
    'password': os.environ.get('DB_PASS', 'Zuokaiqi123'),
    'database': os.environ.get('DB_NAME', 'daytrace'),
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
    try:
        cur.execute("UPDATE users SET is_admin=1 WHERE username='17763714593'")
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
        return jsonify({'error': '用户名不存在'}), 401
    _, pw_hash = hash_password(password, user['salt'])
    if pw_hash != user['password_hash']:
        return jsonify({'error': '密码错误'}), 401

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

FEEDBACK_TO = os.environ.get('FEEDBACK_EMAIL', 'zuokaiqi0929@163.com')
SMTP_HOST = os.environ.get('SMTP_HOST', 'smtp.163.com')
SMTP_PORT = int(os.environ.get('SMTP_PORT', 465))
SMTP_USER = os.environ.get('SMTP_USER', 'zuokaiqi0929@163.com')
SMTP_PASS = os.environ.get('SMTP_PASS', 'CJjjHEGECG4WerFa')

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


if __name__ == '__main__':
    print("Initializing database...")
    init_db()
    print("Database ready.")
    port = int(os.environ.get('PORT', 5000))
    print(f"DayTrace running on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
