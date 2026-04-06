<template>
  <Teleport to="body">
    <div v-if="open" class="profile-overlay" @click="open = false"></div>
    <div v-if="open" class="profile-panel-wrap">
      <div class="profile-header"><span>个人中心</span><button class="profile-close" @click="open = false">✕</button></div>
      <div class="profile-body">
        <!-- Avatar Section -->
        <div class="avatar-section">
          <div class="avatar-preview" @click="triggerUpload">
            <img v-if="avatarPreview" :src="avatarPreview" class="avatar-img" alt="头像">
            <span v-else class="avatar-placeholder">👤</span>
            <div class="avatar-overlay">
              <span>{{ uploading ? '上传中...' : '更换头像' }}</span>
            </div>
          </div>
          <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden @change="onFileSelected">
          <div class="avatar-hint">点击头像更换，支持 jpg/png/gif/webp，最大 5MB</div>
        </div>

        <div class="profile-field"><label>用户名</label><input :value="auth.username" disabled></div>
        <div class="profile-field"><label>昵称</label><input v-model="nickname" placeholder="设置昵称" maxlength="50"></div>
        <button class="profile-save-btn" @click="saveProfile">保存昵称</button>
        <div class="profile-divider"></div>
        <div class="profile-section-title">修改密码</div>
        <div class="profile-field"><label>原密码</label><input v-model="oldPw" type="password" placeholder="输入原密码"></div>
        <div class="profile-field"><label>新密码</label><input v-model="newPw" type="password" placeholder="至少6个字符"></div>
        <button class="profile-pw-btn" @click="changePw">修改密码</button>
        <div class="profile-divider"></div>
        <button class="profile-feedback-btn" @click="openFeedback">💬 意见反馈</button>
        <div class="profile-divider"></div>
        <button class="profile-logout-btn" @click="doLogout">退出登录</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { authFetch } from '../utils/api'
import { showToast } from '../composables/useToast'

const auth = useAuthStore()
const open = ref(false)
const nickname = ref(auth.nickname)
const oldPw = ref('')
const newPw = ref('')
const fileInput = ref(null)
const avatarPreview = ref(auth.avatarUrl)
const uploading = ref(false)

function triggerUpload() {
  if (!uploading.value) fileInput.value?.click()
}

async function onFileSelected(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片不能超过 5MB')
    return
  }

  // Show local preview immediately
  const reader = new FileReader()
  reader.onload = (ev) => { avatarPreview.value = ev.target.result }
  reader.readAsDataURL(file)

  // Upload
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const token = localStorage.getItem('dt_token')
    const resp = await fetch('/api/avatar', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: formData
    })
    const data = await resp.json()
    if (resp.ok && data.avatar) {
      auth.avatar = data.avatar
      localStorage.setItem('dt_avatar', data.avatar)
      avatarPreview.value = data.avatar
      showToast('头像已更新')
    } else {
      showToast(data.error || '上传失败')
      avatarPreview.value = auth.avatarUrl
    }
  } catch {
    showToast('网络错误')
    avatarPreview.value = auth.avatarUrl
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

async function saveProfile() {
  try {
    const resp = await authFetch('/api/profile', { method: 'PUT', body: JSON.stringify({ nickname: nickname.value }) })
    if (resp.ok) { auth.nickname = nickname.value; localStorage.setItem('dt_nickname', nickname.value); showToast('已保存') }
    else showToast('保存失败')
  } catch { showToast('网络错误') }
}

async function changePw() {
  if (!oldPw.value || !newPw.value || newPw.value.length < 6) { showToast('请填写完整，密码至少6位'); return }
  try {
    const resp = await authFetch('/api/password', { method: 'PUT', body: JSON.stringify({ old_password: oldPw.value, new_password: newPw.value }) })
    const d = await resp.json()
    if (resp.ok) { oldPw.value = ''; newPw.value = ''; showToast('密码已修改') }
    else showToast(d.error || '修改失败')
  } catch { showToast('网络错误') }
}

function doLogout() { if (confirm('确定退出登录？')) auth.logout() }
function openFeedback() { open.value = false; emit('open-feedback') }
function show() { open.value = true; nickname.value = auth.nickname; avatarPreview.value = auth.avatarUrl }

const emit = defineEmits(['open-feedback'])
defineExpose({ show })
</script>

<style>
.profile-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--bg-mask); z-index: 199; }
.profile-panel-wrap {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 380px; max-width: 90vw; background: var(--bg); border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg); z-index: 200; overflow: hidden; max-height: 90vh; overflow-y: auto;
}
.profile-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; font-size: 16px; font-weight: 600; border-bottom: 1px solid var(--border-light);
}
.profile-close { background: transparent; border: none; cursor: pointer; font-size: 16px; color: var(--text-light); padding: 4px; }
.profile-body { padding: 20px; }

/* Avatar */
.avatar-section { display: flex; flex-direction: column; align-items: center; margin-bottom: 20px; }
.avatar-preview {
  width: 80px; height: 80px; border-radius: 50%; overflow: hidden;
  position: relative; cursor: pointer; background: var(--bg-hover);
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--border-light); transition: border-color .2s;
}
.avatar-preview:hover { border-color: var(--blue); }
.avatar-preview:hover .avatar-overlay { opacity: 1; }
.avatar-img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder { font-size: 36px; }
.avatar-overlay {
  position: absolute; inset: 0; background: rgba(0,0,0,.5);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity .2s; border-radius: 50%;
}
.avatar-overlay span { color: #fff; font-size: 11px; font-weight: 500; }
.avatar-hint { font-size: 11px; color: var(--text-secondary); margin-top: 8px; }

.profile-field { margin-bottom: 14px; }
.profile-field label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.profile-field input {
  width: 100%; padding: 8px 12px; border: 1px solid var(--border-light); border-radius: var(--radius);
  font-size: 13px; color: var(--text); background: var(--bg); outline: none; box-sizing: border-box;
}
.profile-field input:focus { border-color: var(--blue); }
.profile-field input:disabled { opacity: .5; }
.profile-save-btn, .profile-pw-btn {
  width: 100%; padding: 9px; border: none; border-radius: var(--radius); background: var(--blue);
  color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; margin-bottom: 8px;
}
.profile-divider { height: 1px; background: var(--border-light); margin: 16px 0; }
.profile-section-title { font-size: 13px; font-weight: 600; color: var(--text); margin-bottom: 12px; }
.profile-logout-btn {
  width: 100%; padding: 9px; border: 1px solid var(--red); border-radius: var(--radius);
  background: transparent; color: var(--red); font-size: 13px; cursor: pointer;
}
.profile-logout-btn:hover { background: var(--red-bg); }
.profile-feedback-btn {
  width: 100%; padding: 9px; border: 1px solid var(--border-light); border-radius: var(--radius);
  background: transparent; color: var(--text); font-size: 13px; cursor: pointer; transition: .15s;
}
.profile-feedback-btn:hover { background: var(--bg-hover); border-color: var(--blue); color: var(--blue); }
</style>
