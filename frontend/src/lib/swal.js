import Swal from 'sweetalert2'

// Base styling configuration to match the app's aesthetic
const baseConfig = {
  customClass: {
    popup: 'bg-card border border-border rounded-2xl shadow-xl p-3 sm:p-4',
    title: 'text-foreground font-extrabold text-xl sm:text-2xl',
    htmlContainer: 'text-muted-foreground text-sm sm:text-base mt-2',
    actions: 'flex gap-3 mt-6',
    confirmButton: 'inline-flex items-center justify-center gap-1.5 font-medium rounded-xl cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 shadow-2xs px-5 py-2.5 text-sm bg-primary text-primary-foreground hover:bg-primary/90',
    cancelButton: 'inline-flex items-center justify-center gap-1.5 font-medium rounded-xl cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 px-5 py-2.5 text-sm bg-muted text-muted-foreground hover:bg-muted/80',
  },
  buttonsStyling: false,
  background: 'hsl(var(--card))',
  color: 'hsl(var(--foreground))',
}

export const showSuccess = (title, text = '') => {
  return Swal.fire({
    ...baseConfig,
    icon: 'success',
    title,
    text,
    timer: 2000,
    showConfirmButton: false,
  })
}

export const showError = (title, text = '') => {
  return Swal.fire({
    ...baseConfig,
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Okay',
  })
}

export const showWarning = (title, text = '') => {
  return Swal.fire({
    ...baseConfig,
    icon: 'warning',
    title,
    text,
    confirmButtonText: 'Understood',
  })
}

export const confirmAction = async (title, text = 'Are you sure you want to proceed?', confirmButtonText = 'Yes, Proceed') => {
  const result = await Swal.fire({
    ...baseConfig,
    icon: 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Cancel',
    reverseButtons: true,
  })
  return result.isConfirmed
}

export const confirmDelete = async (itemName = 'this item') => {
  return await confirmAction(
    'Are you sure?',
    `You are about to delete ${itemName}. This action cannot be undone.`,
    'Yes, Delete'
  )
}

export const showLoading = (title = 'Processing...') => {
  Swal.fire({
    ...baseConfig,
    title,
    text: 'Please wait...',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading()
    }
  })
}

export const closeLoading = () => {
  if (Swal.isVisible()) {
    Swal.close()
  }
}

export const showToast = (message, icon = 'success') => {
  const isSuccess = icon === 'success' || icon === 'info'
  const color = isSuccess ? '#2dd4bf' : '#fb7185' // teal-400 / rose-400 to match screenshot vibe
  const titleText = isSuccess ? 'Success' : 'Ooops!'
  
  const html = `
    <div class="relative mt-8 mx-4 mb-6 font-sans select-none" style="width: 300px;">
      
      <!-- Floating Title -->
      <div class="absolute -top-7 left-0 text-2xl font-bold tracking-wider z-20" style="color: ${color};">
        ${titleText}
      </div>

      <!-- The Colored Backdrop (Bottom Left Shadow) -->
      <div class="absolute w-full h-full rounded-sm -z-10" style="background-color: ${color}; transform: translate(-8px, 8px);"></div>

      <!-- The Main Card -->
      <div class="bg-white dark:bg-card px-4 py-3 flex items-center relative z-10 shadow-sm" style="min-height: 60px;">
        <!-- Icon -->
        <div class="mr-3 flex-shrink-0" style="color: ${color}">
          ${isSuccess 
            ? `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
            : `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
          }
        </div>
        <!-- Message -->
        <div class="text-sm font-medium text-gray-600 dark:text-gray-300 text-left leading-snug w-full">
          ${message}
        </div>
      </div>

      <!-- The Floating Button (Close/Refresh) -->
      <button onclick="Swal.close()" class="absolute -top-3 -right-3 w-8 h-8 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform z-20" style="background-color: ${color}; cursor: pointer;">
        ${isSuccess
          ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>`
          : `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>`
        }
      </button>
    </div>
  `

  Swal.fire({
    toast: true,
    position: 'center',
    html,
    showConfirmButton: false,
    timer: 3000,
    background: 'transparent',
    customClass: {
      popup: '!bg-transparent !p-0 !shadow-none !border-none',
    }
  })
}
