<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const token = ref(localStorage.getItem('blog-token') || '')
const user = ref(null)
const posts = ref([])
const myPosts = ref([])
const selectedPost = ref(null)
const activeView = ref('posts')
const authMode = ref('login')
const isLoading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const postForm = reactive({ title: '', content: '' })
const authForm = reactive({ username: '', email: '', password: '' })
const passwordForm = reactive({ newPassword: '' })
const editingPostId = ref('')

const isAuthenticated = computed(() => Boolean(token.value && user.value))
const visiblePosts = computed(() => {
  return activeView.value === 'mine' ? myPosts.value : posts.value
})

function clearMessages() {
  errorMessage.value = ''
  successMessage.value = ''
}

function getErrorMessage(data, fallback) {
  if (typeof data?.error === 'string') return data.error
  if (data?.error?.message) return data.error.message
  if (data?.message) return data.message
  if (data?.auth) return data.message || data.auth
  return fallback
}

async function request(path, options = {}, authenticated = true) {
  const headers = new Headers(options.headers || {})
  if (options.body) headers.set('Content-Type', 'application/json')
  if (authenticated && token.value) headers.set('Authorization', `Bearer ${token.value}`)

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 401 && authenticated) signOut(false)
    throw new Error(getErrorMessage(data, `Request failed (${response.status})`))
  }

  return data
}

async function loadPosts() {
  const data = await request('/posts')
  posts.value = data.posts || []
}

async function loadMyPosts() {
  const data = await request('/posts/mine')
  myPosts.value = data.posts || []
}

async function loadPost(postId) {
  const data = await request(`/posts/${encodeURIComponent(postId)}`)
  selectedPost.value = data.post
}

async function loadProfile() {
  const data = await request('/users/details')
  user.value = data.user
}

function routeForPath(pathname) {
  if (pathname === '/mine') return { view: 'mine' }
  if (pathname === '/profile') return { view: 'profile' }

  const postMatch = pathname.match(/^\/posts\/([^/]+)$/)
  if (postMatch) return { view: 'post', postId: decodeURIComponent(postMatch[1]) }

  return { view: 'posts' }
}

async function syncRoute() {
  const route = routeForPath(window.location.pathname)
  activeView.value = route.view
  clearMessages()

  if (!isAuthenticated.value) return

  if (route.view === 'mine') {
    await loadMyPosts()
  } else if (route.view === 'post') {
    await loadPost(route.postId)
  } else if (route.view === 'posts') {
    await loadPosts()
  } else {
    selectedPost.value = null
  }
}

async function handlePopState() {
  isLoading.value = true
  try {
    await syncRoute()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function navigateTo(view) {
  const paths = { posts: '/', mine: '/mine', profile: '/profile' }
  const path = paths[view]
  if (!path) return

  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
  }

  isLoading.value = true
  try {
    await syncRoute()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function openPost(postId) {
  const path = `/posts/${encodeURIComponent(postId)}`
  if (window.location.pathname !== path) {
    window.history.pushState({}, '', path)
  }

  isLoading.value = true
  try {
    await syncRoute()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function initializeSession() {
  if (!token.value) return

  isLoading.value = true
  try {
    await loadProfile()
    await syncRoute()
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function submitAuth() {
  clearMessages()
  isLoading.value = true

  try {
    if (authMode.value === 'register') {
      await request('/users/register', {
        method: 'POST',
        body: JSON.stringify(authForm),
      }, false)
      successMessage.value = 'Account created. Sign in with your new credentials.'
      authMode.value = 'login'
      authForm.username = ''
      authForm.password = ''
      return
    }

    const data = await request('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email: authForm.email, password: authForm.password }),
    }, false)

    token.value = data.access
    localStorage.setItem('blog-token', data.access)
    authForm.password = ''
    await loadProfile()
    await syncRoute()
    successMessage.value = `Welcome back, ${user.value.username}.`
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function savePost() {
  clearMessages()
  isLoading.value = true

  try {
    const isEditing = Boolean(editingPostId.value)
    await request(isEditing ? `/posts/${editingPostId.value}` : '/posts', {
      method: isEditing ? 'PATCH' : 'POST',
      body: JSON.stringify(postForm),
    })
    await loadPosts()
    if (activeView.value === 'mine') await loadMyPosts()
    cancelEdit()
    successMessage.value = isEditing ? 'Your post was updated.' : 'Your post was published.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

function startEdit(post) {
  if (window.location.pathname !== '/') {
    window.history.pushState({}, '', '/')
  }
  editingPostId.value = post._id
  postForm.title = post.title
  postForm.content = post.content
  activeView.value = 'posts'
  clearMessages()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function cancelEdit() {
  editingPostId.value = ''
  postForm.title = ''
  postForm.content = ''
}

async function deletePost(postId) {
  if (!window.confirm('Delete this post? This cannot be undone.')) return

  clearMessages()
  isLoading.value = true
  try {
    await request(`/posts/${postId}`, { method: 'DELETE' })
    if (activeView.value === 'mine') {
      await loadMyPosts()
    } else if (activeView.value === 'post') {
      await navigateTo('posts')
    } else {
      await loadPosts()
    }
    successMessage.value = 'Your post was deleted.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

async function updatePassword() {
  clearMessages()
  isLoading.value = true
  try {
    const data = await request('/users/update-password', {
      method: 'PATCH',
      body: JSON.stringify(passwordForm),
    })
    passwordForm.newPassword = ''
    successMessage.value = data.message || 'Password updated.'
  } catch (error) {
    errorMessage.value = error.message
  } finally {
    isLoading.value = false
  }
}

function signOut(showMessage = true) {
  token.value = ''
  user.value = null
  posts.value = []
  myPosts.value = []
  selectedPost.value = null
  localStorage.removeItem('blog-token')
  activeView.value = 'posts'
  if (window.location.pathname !== '/') {
    window.history.replaceState({}, '', '/')
  }
  cancelEdit()
  if (showMessage) {
    clearMessages()
    successMessage.value = 'You have been signed out.'
  }
}

function formatDate(value) {
  if (!value) return 'Just now'
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(new Date(value))
}

function formatTime(value) {
  if (!value) return ''
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

onMounted(() => {
  window.addEventListener('popstate', handlePopState)
  initializeSession()
})

onUnmounted(() => {
  window.removeEventListener('popstate', handlePopState)
})
</script>

<template>
  <div class="app-shell">
    <header class="site-header">
      <a class="wordmark" href="/" @click.prevent="navigateTo('posts')">
        <span class="wordmark-mark">b.</span>
        <span>the blog</span>
      </a>

      <nav v-if="isAuthenticated" class="main-nav" aria-label="Main navigation">
        <button :class="{ active: activeView === 'posts' || activeView === 'post' }" @click="navigateTo('posts')">Explore</button>
        <button :class="{ active: activeView === 'mine' }" @click="navigateTo('mine')">My posts</button>
        <button :class="{ active: activeView === 'profile' }" @click="navigateTo('profile')">My profile</button>
      </nav>

      <div v-if="isAuthenticated" class="header-user">
        <span class="user-greeting">Hi, {{ user.username }}</span>
        <button class="sign-out-button" @click="signOut()">Sign out</button>
      </div>
      <div v-else class="header-note">A little space for your thoughts</div>
    </header>

    <main>
      <section v-if="!isAuthenticated" class="welcome-layout">
        <div class="welcome-copy">
          <p class="eyebrow">A place for your words</p>
          <h1>Ideas are better<br />when <em>shared.</em></h1>
          <p class="welcome-description">
            Write a little. Read a little. Find your people, one story at a time.
          </p>
          <div class="welcome-decoration" aria-hidden="true">
            <span>✳</span><span>✳</span><span>✳</span>
          </div>
        </div>

        <section class="auth-card" aria-labelledby="auth-title">
          <p class="eyebrow">{{ authMode === 'login' ? 'Your corner of the internet' : 'Join the community' }}</p>
          <h2 id="auth-title">{{ authMode === 'login' ? 'Welcome back' : 'Create an account' }}</h2>
          <p class="auth-subtitle">
            {{ authMode === 'login' ? 'Sign in to read and share stories.' : 'It only takes a moment to get started.' }}
          </p>

          <div v-if="errorMessage" class="notice notice-error" role="alert">
            <span>{{ errorMessage }}</span>
            <button aria-label="Dismiss error" @click="errorMessage = ''">×</button>
          </div>
          <div v-if="successMessage" class="notice notice-success" role="status">
            <span>{{ successMessage }}</span>
            <button aria-label="Dismiss message" @click="successMessage = ''">×</button>
          </div>

          <form class="form-stack" @submit.prevent="submitAuth">
            <label v-if="authMode === 'register'" class="field">
              <span>Your name</span>
              <input v-model.trim="authForm.username" autocomplete="name" required placeholder="e.g. Alex" />
            </label>
            <label class="field">
              <span>Email address</span>
              <input
                v-model.trim="authForm.email"
                type="email"
                autocomplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <label class="field">
              <span>Password</span>
              <input
                v-model="authForm.password"
                type="password"
                :autocomplete="authMode === 'login' ? 'current-password' : 'new-password'"
                minlength="8"
                required
                placeholder="At least 8 characters"
              />
            </label>
            <button class="primary-button" type="submit" :disabled="isLoading">
              {{ isLoading ? 'One moment…' : authMode === 'login' ? 'Sign in' : 'Create account' }}
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          <p class="auth-switch">
            {{ authMode === 'login' ? 'New around here?' : 'Already have an account?' }}
            <button
              class="text-button"
              @click="authMode = authMode === 'login' ? 'register' : 'login'; clearMessages()"
            >
              {{ authMode === 'login' ? 'Create an account' : 'Sign in' }}
            </button>
          </p>
          <p class="privacy-note">Your password is securely hashed. We never store it as plain text.</p>
        </section>
      </section>

      <section v-else class="content-layout">
        <div class="page-heading">
          <div>
            <p class="eyebrow">
              {{ activeView === 'mine' ? 'Your writing' : activeView === 'profile' ? 'Your account' : activeView === 'post' ? 'A story from the community' : 'The latest' }}
            </p>
            <h1>
              {{ activeView === 'mine' ? 'My posts' : activeView === 'profile' ? 'My profile' : activeView === 'post' ? selectedPost?.title || 'Story' : 'Stories worth sharing.' }}
            </h1>
          </div>
          <p v-if="activeView === 'posts' || activeView === 'mine'" class="post-count">
            {{ visiblePosts.length }} {{ visiblePosts.length === 1 ? 'story' : 'stories' }}
          </p>
        </div>

        <div v-if="errorMessage" class="notice notice-error" role="alert">
          <span>{{ errorMessage }}</span>
          <button aria-label="Dismiss error" @click="errorMessage = ''">×</button>
        </div>
        <div v-if="successMessage" class="notice notice-success" role="status">
          <span>{{ successMessage }}</span>
          <button aria-label="Dismiss message" @click="successMessage = ''">×</button>
        </div>

        <section v-if="activeView === 'profile'" class="profile-card">
          <div class="profile-avatar">{{ user.username?.charAt(0).toUpperCase() }}</div>
          <div class="profile-details">
            <p class="eyebrow">Signed in as</p>
            <h2>{{ user.username }}</h2>
            <p>{{ user.email }}</p>
          </div>
          <form class="password-form" @submit.prevent="updatePassword">
            <h3>Change password</h3>
            <label class="field">
              <span>New password</span>
              <input
                v-model="passwordForm.newPassword"
                type="password"
                autocomplete="new-password"
                minlength="8"
                required
                placeholder="At least 8 characters"
              />
            </label>
            <button class="secondary-button" type="submit" :disabled="isLoading">Update password</button>
          </form>
        </section>

        <article v-else-if="activeView === 'post'" class="single-post">
          <button class="back-link" @click="navigateTo('posts')">← Back to stories</button>
          <div v-if="isLoading && !selectedPost" class="empty-state">Loading story…</div>
          <div v-else-if="selectedPost">
            <div class="post-meta">
              <span class="post-avatar">{{ selectedPost.authorUsername?.charAt(0).toUpperCase() || '✳' }}</span>
              <span>{{ selectedPost.authorUsername || 'Unknown writer' }}</span>
              <span class="meta-dot">·</span>
              <time :datetime="selectedPost.creationDate">
                {{ formatDate(selectedPost.creationDate) }}<template v-if="selectedPost.creationDate"> · {{ formatTime(selectedPost.creationDate) }}</template>
              </time>
            </div>
            <h2 class="single-post-title">{{ selectedPost.title }}</h2>
            <p class="single-post-content">{{ selectedPost.content }}</p>
            <div
              v-if="String(selectedPost.author) === String(user._id) || user.isAdmin"
              class="post-actions"
            >
              <button
                v-if="String(selectedPost.author) === String(user._id)"
                class="text-button"
                @click="startEdit(selectedPost)"
              >
                Edit
              </button>
              <button
                class="text-button danger-text"
                @click="deletePost(selectedPost._id)"
              >
                Delete
              </button>
            </div>
          </div>
          <div v-else-if="!isLoading" class="empty-state">
            <h2>Story not available</h2>
            <p>This post may have been deleted or the link may be incorrect.</p>
          </div>
        </article>

        <div v-else class="posts-layout">
          <section class="feed">
            <div v-if="isLoading && visiblePosts.length === 0" class="empty-state">Loading stories…</div>
            <article v-for="post in visiblePosts" :key="post._id" class="post-card">
              <div class="post-meta">
                <span class="post-avatar">{{ post.authorUsername?.charAt(0).toUpperCase() || '✳' }}</span>
                <span>{{ post.authorUsername || 'Unknown writer' }}</span>
                <span class="meta-dot">·</span>
                <time :datetime="post.creationDate">
                  {{ formatDate(post.creationDate) }}<template v-if="post.creationDate"> · {{ formatTime(post.creationDate) }}</template>
                </time>
              </div>
              <h2>
                <button class="post-title-link" @click="openPost(post._id)">{{ post.title }}</button>
              </h2>
              <p class="post-content post-preview">{{ post.content }}</p>
              <div
                v-if="String(post.author) === String(user._id) || user.isAdmin"
                class="post-actions"
              >
                <button
                  v-if="String(post.author) === String(user._id)"
                  class="text-button"
                  @click="startEdit(post)"
                >
                  Edit
                </button>
                <button
                  v-if="String(post.author) === String(user._id) || user.isAdmin"
                  class="text-button danger-text"
                  @click="deletePost(post._id)"
                >
                  Delete
                </button>
              </div>
            </article>
            <div v-if="!isLoading && visiblePosts.length === 0" class="empty-state">
              <span class="empty-sparkle">✳</span>
              <h2>{{ activeView === 'mine' ? 'Your story starts here.' : 'A quiet little corner.' }}</h2>
              <p>{{ activeView === 'mine' ? 'Write your first post using the editor.' : 'No posts yet. Be the first to share something.' }}</p>
            </div>
          </section>

          <aside class="composer-card">
            <p class="eyebrow">{{ editingPostId ? 'Make it even better' : 'Got something to say?' }}</p>
            <h2>{{ editingPostId ? 'Edit your story' : 'Write a story' }}</h2>
            <form class="form-stack" @submit.prevent="savePost">
              <label class="field">
                <span>Title</span>
                <input v-model.trim="postForm.title" required maxlength="200" placeholder="Give it a good title" />
              </label>
              <label class="field">
                <span>Your story</span>
                <textarea v-model.trim="postForm.content" rows="8" required placeholder="Start writing here…"></textarea>
              </label>
              <button class="primary-button" type="submit" :disabled="isLoading">
                {{ isLoading ? 'Saving…' : editingPostId ? 'Save changes' : 'Publish story' }}
                <span aria-hidden="true">↗</span>
              </button>
              <button v-if="editingPostId" class="cancel-button" type="button" @click="cancelEdit">Cancel editing</button>
            </form>
            <p class="composer-footnote">Your words belong to you. You can edit or remove your post any time.</p>
          </aside>
        </div>
      </section>
    </main>

    <footer class="site-footer">
      <span>the blog <span class="footer-dot">·</span> made for the love of words</span>
      <span>Write something kind today.</span>
    </footer>
  </div>
</template>
