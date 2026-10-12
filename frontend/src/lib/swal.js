import Swal from 'sweetalert2'

const baseConfig = {
  customClass: {
    popup: '!bg-[#0b1220] !backdrop-blur-xl border border-white/10 !rounded-[32px] shadow-2xl p-8 sm:p-10 max-w-[440px]',
    title: 'hidden',
    htmlContainer: '!m-0 !p-0',
    actions: 'flex gap-4 mt-6 justify-center w-full',
    confirmButton: 'inline-flex items-center justify-center font-bold !rounded-full cursor-pointer transition-all hover:bg-[#2e476d] active:scale-95 px-12 py-2.5 text-[16px] bg-[#253c5e] text-white border border-white/10 shadow-lg tracking-wide',
    cancelButton: 'inline-flex items-center justify-center font-bold !rounded-full cursor-pointer transition-transform hover:scale-105 active:scale-95 px-8 py-2.5 text-[15px] bg-[#2f2b3b] hover:bg-[#3a3547] text-foreground shadow-sm border-none',
  },
  buttonsStyling: false,
  background: 'transparent',
  color: 'inherit',
  showClass: {
    popup: 'animate-[fadeIn_0.15s_ease-out]'
  },
  hideClass: {
    popup: '',
    backdrop: ''
  }
}

const buildHtml = (title, text, type = 'success') => {
  const isSuccess = type === 'success';
  const iconSvg = isSuccess
    ? `<div class="w-12 h-12 rounded-2xl bg-[#063326] text-[#00c982] border border-[#00c982]/30 flex items-center justify-center shadow-sm mx-auto mb-3">
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>
       </div>`
    : `<div class="swal-close-icon flex items-center justify-center mx-auto mb-3.5 cursor-pointer hover:opacity-80 transition-opacity" title="Close">
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
       </div>`;

  return `
    <div class="flex flex-col items-center pt-1 pb-1">
      ${iconSvg}
      <div class="text-center font-bold text-2xl text-white mb-2 tracking-tight">
        ${title}
      </div>
      ${text ? `
      <div class="flex items-start text-center w-full max-w-[340px] mx-auto justify-center">
        <div class="text-slate-200 text-base font-normal leading-relaxed text-center">
          ${text}
        </div>
      </div>` : ''}
    </div>
  `;
}

export const showSuccess = (title, text = '', timer = 1500) => {
  return Swal.fire({
    ...baseConfig,
    html: buildHtml(title, text, 'success'),
    timer,
    timerProgressBar: true,
    showConfirmButton: false,
    customClass: {
      ...baseConfig.customClass,
      timerProgressBar: '!bg-[#00c982]',
    }
  })
}

export const showError = async (title, text = '', confirmButtonText = 'OK') => {
  const result = await Swal.fire({
    ...baseConfig,
    html: buildHtml(title, text, 'error'),
    showConfirmButton: true,
    confirmButtonText: typeof confirmButtonText === 'string' ? confirmButtonText : 'OK',
    showCancelButton: false,
    allowOutsideClick: true,
    allowEscapeKey: true,
    allowEnterKey: true,
    focusConfirm: true,
    didRender: (popup) => {
      const okBtn = popup.querySelector('.swal2-confirm')
      if (okBtn) {
        okBtn.onclick = () => {
          Swal.close()
        }
      }
      const closeIcon = popup.querySelector('.swal-close-icon')
      if (closeIcon) {
        closeIcon.onclick = () => {
          Swal.close()
        }
      }
    }
  })
  if (Swal.isVisible()) {
    Swal.close()
  }
  return result
}

export const showWarning = async (title, text = '', confirmButtonText = 'OK') => {
  const result = await Swal.fire({
    ...baseConfig,
    html: buildHtml(title, text, 'error'),
    showConfirmButton: true,
    confirmButtonText: typeof confirmButtonText === 'string' ? confirmButtonText : 'OK',
    showCancelButton: false,
    allowOutsideClick: true,
    allowEscapeKey: true,
    allowEnterKey: true,
    focusConfirm: true,
    didRender: (popup) => {
      const okBtn = popup.querySelector('.swal2-confirm')
      if (okBtn) {
        okBtn.onclick = () => {
          Swal.close()
        }
      }
      const closeIcon = popup.querySelector('.swal-close-icon')
      if (closeIcon) {
        closeIcon.onclick = () => {
          Swal.close()
        }
      }
    }
  })
  if (Swal.isVisible()) {
    Swal.close()
  }
  return result
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

export const showToast = (message, icon = 'success', position = 'center') => {
  const isSuccess = icon === 'success'
  const isInfo = icon === 'info'
  const isWarning = icon === 'warning'
  const isError = icon === 'error'

  const defaultTitle = isSuccess ? 'SUCCESS' : (isInfo ? 'NOTICE' : (isWarning ? 'WARNING' : 'FAILED'))
  let titleText = defaultTitle
  let bodyText = message

  // If message contains a colon-separated header
  if (typeof message === 'string') {
    const colonIdx = message.indexOf(': ')
    if (colonIdx > 0 && colonIdx <= 35) {
      titleText = message.slice(0, colonIdx).trim().toUpperCase()
      bodyText = message.slice(colonIdx + 2).trim()
    }
  }

  let bgBadge = 'bg-[#063326] text-[#00c982] border-[#00c982]/30'
  let titleColor = 'text-[#00c982]'
  let progressBarColor = '!bg-[#00c982]'
  let iconSvg = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"></path></svg>`

  if (isInfo) {
    bgBadge = 'bg-blue-950/70 text-blue-400 border-blue-500/30'
    titleColor = 'text-blue-400'
    progressBarColor = '!bg-blue-400'
    iconSvg = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
  } else if (isWarning) {
    bgBadge = 'bg-amber-950/70 text-amber-400 border-amber-500/30'
    titleColor = 'text-amber-400'
    progressBarColor = '!bg-amber-400'
    iconSvg = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`
  } else if (isError) {
    bgBadge = 'bg-rose-950/70 text-rose-400 border-rose-500/30'
    titleColor = 'text-rose-400'
    progressBarColor = '!bg-rose-400'
    iconSvg = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
  }

  const html = `
    <div class="flex items-center gap-3.5 w-full py-1 text-left">
      <div class="flex-shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center ${bgBadge}">
        ${iconSvg}
      </div>
      <div class="flex-1 min-w-0 pr-1">
        <div class="text-[11px] font-extrabold uppercase tracking-wider ${titleColor} mb-0.5">
          ${titleText}
        </div>
        <div class="text-[16px] font-bold text-white leading-snug break-words">
          ${bodyText}
        </div>
      </div>
    </div>
  `

  Swal.fire({
    toast: true,
    position,
    html,
    showConfirmButton: false,
    showCloseButton: true,
    timer: 3500,
    timerProgressBar: true,
    background: 'transparent',
    customClass: {
      popup: '!bg-[#0c1322] !backdrop-blur-md !border !border-white/10 !rounded-2xl !shadow-2xl !p-3.5 !min-w-[300px] !max-w-[440px]',
      closeButton: '!text-slate-400 hover:!text-white !text-sm focus:!shadow-none',
      timerProgressBar: progressBarColor,
    }
  })
}
