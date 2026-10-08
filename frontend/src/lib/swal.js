import Swal from 'sweetalert2'

const baseConfig = {
  customClass: {
    popup: '!bg-[#f5eff7]/95 dark:!bg-[#1c1825]/95 !backdrop-blur-xl border border-white/40 dark:border-white/10 !rounded-2xl shadow-xl p-6 sm:p-8',
    title: 'hidden',
    htmlContainer: '!m-0 !p-0',
    actions: 'flex gap-4 mt-8 justify-center w-full',
    confirmButton: 'inline-flex items-center justify-center font-bold !rounded-full cursor-pointer transition-transform hover:scale-105 active:scale-95 px-8 py-2.5 text-[15px] bg-[#007aff] text-white shadow-sm border-none uppercase',
    cancelButton: 'inline-flex items-center justify-center font-bold !rounded-full cursor-pointer transition-transform hover:scale-105 active:scale-95 px-8 py-2.5 text-[15px] bg-[#dce0e5] hover:bg-[#cfd4db] dark:bg-[#2f2b3b] dark:hover:bg-[#3a3547] text-slate-900 dark:text-white shadow-sm border-none',
  },
  buttonsStyling: false,
  background: 'transparent',
  color: 'inherit',
  showClass: {
    popup: 'animate-[fadeIn_0.2s_ease-out]'
  },
  hideClass: {
    popup: 'animate-[fadeOut_0.2s_ease-in]'
  }
}

const buildHtml = (title, text, type = 'success') => {
  const isSuccess = type === 'success';
  const iconSvg = isSuccess 
    ? `<svg class="w-12 h-12 mx-auto text-[#007aff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    : `<svg class="w-12 h-12 mx-auto text-black dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;

  return `
    <div class="flex flex-col items-center pt-2">
      <div class="mb-4">
        ${iconSvg}
      </div>
      <div class="text-center font-bold text-[19px] text-slate-900 dark:text-white mb-3">
        ${title}
      </div>
      <div class="flex items-start gap-3 text-left w-full max-w-[300px] mx-auto justify-center">
        <div class="text-slate-800 dark:text-slate-200 text-[15px] font-medium leading-relaxed text-center">
          ${text}
        </div>
      </div>
    </div>
  `;
}

export const showSuccess = (title, text = '') => {
  return Swal.fire({
    ...baseConfig,
    html: buildHtml(title, text, 'success'),
    timer: 2000,
    showConfirmButton: false,
  })
}

export const showError = (title, text = '') => {
  return Swal.fire({
    ...baseConfig,
    html: buildHtml(title, text, 'error'),
    confirmButtonText: 'YES',
  })
}

export const showWarning = (title, text = '') => {
  return Swal.fire({
    ...baseConfig,
    html: buildHtml(title, text, 'error'),
    confirmButtonText: 'YES',
  })
}

export const confirmAction = async (title, text = 'Are you sure you want to proceed?', confirmButtonText = 'YES') => {
  const isDelete = confirmButtonText.toLowerCase().includes('delete') || text.toLowerCase().includes('delete');
  
  const result = await Swal.fire({
    ...baseConfig,
    html: buildHtml(title, text, isDelete ? 'error' : 'success'),
    showCancelButton: true,
    confirmButtonText, 
    cancelButtonText: 'Cancel',
    reverseButtons: true, 
  })
  return result.isConfirmed
}

export const confirmDelete = async (itemName = 'this item') => {
  return await confirmAction(
    'Delete Product?',
    `Are you sure you want to delete ${itemName}? This cannot be undone.`,
    'DELETE'
  )
}

export const showLoading = (title = 'Processing...') => {
  Swal.fire({
    ...baseConfig,
    html: buildHtml(title, 'Please wait...', 'success'),
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
  const color = isSuccess ? '#2dd4bf' : '#fb7185'
  const titleText = isSuccess ? 'Success' : 'Ooops!'
  
  const html = `
    <div class="relative mt-8 mx-4 mb-6 font-sans select-none" style="width: 300px;">
      <div class="absolute -top-7 left-0 text-2xl font-bold tracking-wider z-20" style="color: ${color};">
        ${titleText}
      </div>
      <div class="absolute w-full h-full rounded-sm -z-10" style="background-color: ${color}; transform: translate(-8px, 8px);"></div>
      <div class="bg-white dark:bg-card px-4 py-3 flex items-center relative z-10 shadow-sm" style="min-height: 60px;">
        <div class="mr-3 flex-shrink-0" style="color: ${color}">
          ${isSuccess 
            ? '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
            : '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
          }
        </div>
        <div class="text-sm font-medium text-gray-600 dark:text-gray-300 text-left leading-snug w-full">
          ${message}
        </div>
      </div>
      <button onclick="Swal.close()" class="absolute -top-3 -right-3 w-8 h-8 rounded-full text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform z-20" style="background-color: ${color}; cursor: pointer;">
        ${isSuccess
          ? '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>'
          : '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>'
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
