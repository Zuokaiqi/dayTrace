<template>
  <Teleport to="body">
    <div v-if="open" class="fb-overlay" @click="open = false"></div>
    <div v-if="open" class="fb-panel">
      <div class="fb-header">
        <span> 意见反馈</span>
        <button class="fb-close" @click="open = false"></button>
      </div>
      <div class="fb-body">
        <div class="fb-hint">你的反馈对我们很重要，问题、建议、吐槽都欢迎</div>
        <textarea v-model="content" class="fb-input" rows="6" placeholder="描述你的问题或建议..." @keydown.ctrl.enter="submit"></textarea>
        <div class="fb-images">
          <div v-for="(img, i) in previews" :key="i" class="fb-img-wrap">
            <img :src="img" class="fb-img-preview" alt="">
            <button class="fb-img-del" @click="removeImage(i)"></button>
          </div>
          <label v-if="previews.length < 3" class="fb-img-add" title="添加截图">
            <input type="file" accept="image/*" hidden @change="onImageSelect">
            <span>+</span>
            <span class="fb-img-add-text">截图</span>
          </label>
        </div>
        <div class="fb-footer">
          <span class="fb-footer-hint">Ctrl + Enter 提交</span>
          <button class="fb-submit" :disabled="!content.trim() || submitting" @click="submit">
            <span v-if="submitting" class="fb-spinner"></span>
            {{ submitting ? '提交中' : '提交反馈' }}
          </button>
        </div>
        <div v-if="success" class="fb-success"> 感谢小伙伴提交的意见，我一定会认真阅读，迭代产品的！！</div>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
import { ref } from 'vue'
const open = ref(false)
const content = ref('')
const files = ref([])
const previews = ref([])
const submitting = ref(false)
const success = ref(false)
function show() {
  open.value = true
  content.value = ''
  files.value = []
  previews.value = []
  success.value = false
}
function onImageSelect(e) {
  const f = e.target.files?.[0]
  if (!f || files.value.length >= 3) return
  if (f.size > 5 * 1024 * 1024) { alert('图片不能超过 5MB'); return }
  files.value.push(f)
  const reader = new FileReader()
  reader.onload = (ev) => previews.value.push(ev.target.result)
  reader.readAsDataURL(f)
  e.target.value = ''
}
function removeImage(i) {
  files.value.splice(i, 1)
  previews.value.splice(i, 1)
}
async function submit() {
  if (!content.value.trim() || submitting.value) return
  submitting.value = true
  success.value = false
  try {
    const fd = new FormData()
    fd.append('content', content.value.trim())
    files.value.forEach((f, i) => fd.append('image' + i, f))
    const token = localStorage.getItem('dt_token')
    const resp = await fetch('/api/feedback', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      body: fd
    })
    if (resp.ok) {
      success.value = true
      content.value = ''
      files.value = []
      previews.value = []
    }
  } catch {}
  finally { submitting.value = false }
}
defineExpose({ show })
</script>
<style>
.fb-overlay{position:fixed;inset:0;background:var(--bg-mask);z-index:199}
.fb-panel{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:440px;max-width:92vw;max-height:85vh;background:var(--bg);border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.18);z-index:200;display:flex;flex-direction:column;overflow:hidden;animation:fbIn .2s cubic-bezier(.16,1,.3,1)}
@keyframes fbIn{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}}
.fb-header{display:flex;align-items:center;justify-content:space-between;padding:16px 22px;font-size:15px;font-weight:600;border-bottom:1px solid var(--border-light)}
.fb-close{background:transparent;border:none;cursor:pointer;font-size:14px;color:var(--text-light);padding:4px 6px;border-radius:6px;transition:.15s}
.fb-close:hover{background:var(--bg-hover);color:var(--text)}
.fb-body{padding:20px 22px;overflow-y:auto}
.fb-hint{font-size:12px;color:var(--text-secondary);margin-bottom:14px;line-height:1.5}
.fb-input{width:100%;padding:12px 14px;border:1px solid var(--border-light);border-radius:10px;font-size:13px;line-height:1.6;resize:vertical;background:var(--bg);color:var(--text);outline:none;box-sizing:border-box;font-family:inherit;transition:.2s}
.fb-input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(51,112,255,.1)}
.fb-input::placeholder{color:var(--text-light)}
.fb-images{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}
.fb-img-wrap{position:relative;width:72px;height:72px;border-radius:8px;overflow:hidden;border:1px solid var(--border-light)}
.fb-img-preview{width:100%;height:100%;object-fit:cover}
.fb-img-del{position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.fb-img-add{width:72px;height:72px;border:2px dashed var(--border-light);border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:.15s;gap:2px;color:var(--text-light)}
.fb-img-add:hover{border-color:var(--blue);color:var(--blue)}
.fb-img-add span:first-child{font-size:22px;line-height:1}
.fb-img-add-text{font-size:10px}
.fb-footer{display:flex;align-items:center;justify-content:space-between;margin-top:18px}
.fb-footer-hint{font-size:11px;color:var(--text-light)}
.fb-submit{display:inline-flex;align-items:center;gap:6px;padding:9px 22px;border:none;border-radius:8px;background:var(--blue);color:#fff;font-size:13px;font-weight:600;cursor:pointer;transition:.15s}
.fb-submit:hover:not(:disabled){background:#245bdb;transform:translateY(-1px)}
.fb-submit:active:not(:disabled){transform:scale(.97)}
.fb-submit:disabled{opacity:.4;cursor:default}
.fb-spinner{width:12px;height:12px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;display:inline-block}
.fb-success{margin-top:16px;padding:12px 16px;background:rgba(52,168,83,.08);border:1px solid rgba(52,168,83,.2);border-radius:10px;font-size:13px;color:var(--green,#34a853);text-align:center}
</style>