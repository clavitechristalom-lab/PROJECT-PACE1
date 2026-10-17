import Swal from 'sweetalert2'

/**
 * Global Theme Detector
 */
const isDarkMode = () => {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

/**
 * Build dynamic theme configuration for SweetAlert2 popups
 */
const getPopupConfig = (type = 'info', isDanger = false) => {
  const dark = isDarkMode()

  const popupBg = dark ? '!bg-[#0c1612] !border-emerald-500/25' : '!bg-white !border-slate-200'
  const textColor = dark ? '!text-white' : '!text-slate-900'

  let confirmBtnClass = 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
  if (isDanger || type === 'error') {
    confirmBtnClass = 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20'
  } else if (type === 'warning') {
    confirmBtnClass = 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20'
  }

  const cancelBtnClass = dark
    ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'

  return {
    customClass: {
      popup: `${popupBg} !backdrop-blur-xl border !rounded-3xl shadow-2xl p-6 sm:p-8 max-w-[420px] ${textColor}`,
      title: 'hidden',
      htmlContainer: '!m-0 !p-0',
      actions: 'flex items-center justify-center gap-3 mt-6 w-full',
      confirmButton: `inline-flex items-center justify-center font-bold !rounded-xl cursor-pointer transition-all active:scale-95 px-6 py-2.5 text-sm ${confirmBtnClass}`,
      cancelButton: `inline-flex items-center justify-center font-semibold !rounded-xl cursor-pointer transition-all active:scale-95 px-5 py-2.5 text-sm ${cancelBtnClass}`,
    },
    buttonsStyling: false,
    background: 'transparent',
    color: 'inherit',
    backdrop: dark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(15, 23, 42, 0.45)',
    showClass: {
      popup: 'animate-[fadeIn_0.15s_ease-out]'
    },
    hideClass: {
      popup: '',
      backdrop: ''
    }
  }
}

/**
 * Unified HTML builder for dialog contents
 */
const buildHtml = (title, text = '', type = 'success') => {
  const dark = isDarkMode()

  let iconHtml = ''
  if (type === 'success') {
    iconHtml = `
      <div class="w-13 h-13 rounded-2xl ${dark ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200'} border flex items-center justify-center shadow-sm mx-auto mb-3.5">
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>`
  } else if (type === 'error') {
    iconHtml = `
      <div class="w-13 h-13 rounded-2xl ${dark ? 'bg-rose-950/80 text-rose-400 border-rose-500/30' : 'bg-rose-50 text-rose-600 border-rose-200'} border flex items-center justify-center shadow-sm mx-auto mb-3.5">
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>`
  } else if (type === 'warning') {
    iconHtml = `
      <div class="w-13 h-13 rounded-2xl ${dark ? 'bg-amber-950/80 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-600 border-amber-200'} border flex items-center justify-center shadow-sm mx-auto mb-3.5">
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
      </div>`
  } else if (type === 'question' || type === 'delete') {
    iconHtml = `
      <div class="w-13 h-13 rounded-2xl ${dark ? 'bg-rose-950/80 text-rose-400 border-rose-500/30' : 'bg-rose-50 text-rose-600 border-rose-200'} border flex items-center justify-center shadow-sm mx-auto mb-3.5">
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      </div>`
  } else {
    // Info
    iconHtml = `
      <div class="w-13 h-13 rounded-2xl ${dark ? 'bg-blue-950/80 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200'} border flex items-center justify-center shadow-sm mx-auto mb-3.5">
        <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
      </div>`
  }

  const titleColor = dark ? 'text-white' : 'text-slate-900'
  const textColor = dark ? 'text-slate-300' : 'text-slate-600'

  return `
    <div class="flex flex-col items-center pt-1 pb-1">
      ${iconHtml}
      <div class="text-center font-bold text-xl sm:text-2xl ${titleColor} mb-2 tracking-tight">
        ${title}
      </div>
      ${text ? `
      <div class="flex items-start text-center w-full max-w-[340px] mx-auto justify-center">
        <div class="${textColor} text-xs sm:text-sm font-normal leading-relaxed text-center">
          ${text}
        </div>
      </div>` : ''}
    </div>
  `
}

/**
 * Success Alert Dialog (Auto-closes or Confirmable)
 */
export const showSuccess = (title, text = '', timer = 2000) => {
  const config = getPopupConfig('success', false)
  return Swal.fire({
    ...config,
    html: buildHtml(title, text, 'success'),
    timer,
    timerProgressBar: true,
    showConfirmButton: false,
    customClass: {
      ...config.customClass,
      timerProgressBar: '!bg-emerald-500',
    }
  })
}

/**
 * Error Alert Dialog
 */
export const showError = async (title, text = '', confirmButtonText = 'OK') => {
  const config = getPopupConfig('error', true)
  const result = await Swal.fire({
    ...config,
    html: buildHtml(title, text, 'error'),
    showConfirmButton: true,
    confirmButtonText: typeof confirmButtonText === 'string' ? confirmButtonText : 'OK',
    showCancelButton: false,
    allowOutsideClick: true,
    allowEscapeKey: true,
  })
  return result
}

/**
 * Warning Alert Dialog
 */
export const showWarning = async (title, text = '', confirmButtonText = 'OK') => {
  const config = getPopupConfig('warning', false)
  const result = await Swal.fire({
    ...config,
    html: buildHtml(title, text, 'warning'),
    showConfirmButton: true,
    confirmButtonText: typeof confirmButtonText === 'string' ? confirmButtonText : 'OK',
    showCancelButton: false,
    allowOutsideClick: true,
    allowEscapeKey: true,
  })
  return result
}

/**
 * Info Alert Dialog
 */
export const showInfo = async (title, text = '', confirmButtonText = 'OK') => {
  const config = getPopupConfig('info', false)
  const result = await Swal.fire({
    ...config,
    html: buildHtml(title, text, 'info'),
    showConfirmButton: true,
    confirmButtonText: typeof confirmButtonText === 'string' ? confirmButtonText : 'OK',
    showCancelButton: false,
    allowOutsideClick: true,
    allowEscapeKey: true,
  })
  return result
}

/**
 * Unified Confirmation Prompt
 * Supports either:
 * - confirmAction(title, text, confirmButtonText, isDanger)
 * - confirmAction({ title, text, confirmButtonText, cancelButtonText, isDanger, icon })
 */
export const confirmAction = async (titleOrOptions, text = 'Are you sure you want to proceed?', confirmButtonText = 'Yes, Proceed', isDangerArg = false) => {
  let title = titleOrOptions
  let cancelButtonText = 'Cancel'
  let isDanger = isDangerArg
  let iconType = 'warning'

  if (typeof titleOrOptions === 'object' && titleOrOptions !== null) {
    title = titleOrOptions.title || 'Are you sure?'
    text = titleOrOptions.text || ''
    confirmButtonText = titleOrOptions.confirmButtonText || titleOrOptions.confirmLabel || 'Yes, Proceed'
    cancelButtonText = titleOrOptions.cancelButtonText || 'Cancel'
    isDanger = titleOrOptions.isDanger || titleOrOptions.danger || false
    iconType = titleOrOptions.icon || (isDanger ? 'delete' : 'warning')
  } else {
    const isDelete = String(confirmButtonText).toLowerCase().includes('delete') || String(title).toLowerCase().includes('delete') || String(text).toLowerCase().includes('delete')
    if (isDelete) {
      isDanger = true
      iconType = 'delete'
    }
  }

  const config = getPopupConfig(iconType, isDanger)
  const result = await Swal.fire({
    ...config,
    html: buildHtml(title, text, iconType),
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    focusCancel: true,
    allowOutsideClick: false,
    allowEscapeKey: true,
  })

  return result.isConfirmed
}

/**
 * Unified Delete Confirmation Prompt
 */
export const confirmDelete = async (itemName = 'this item', customText = null) => {
  const text = customText || `Are you sure you want to permanently delete "${itemName}"? This action cannot be undone.`
  return await confirmAction({
    title: 'Confirm Deletion',
    text,
    confirmButtonText: 'Yes, Delete',
    cancelButtonText: 'Cancel',
    isDanger: true,
    icon: 'delete',
  })
}

/**
 * Loading Indicator Modal
 */
export const showLoading = (title = 'Processing...', text = 'Please wait while we complete this action...') => {
  const config = getPopupConfig('info', false)
  Swal.fire({
    ...config,
    html: buildHtml(title, text, 'info'),
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => {
      Swal.showLoading()
    }
  })
}

/**
 * Close any active SweetAlert Loading / Modal
 */
export const closeLoading = () => {
  if (Swal.isVisible()) {
    Swal.close()
  }
}

/**
 * Unified Toast Notification (Light & Dark Adaptive)
 */
export const showToast = (message, icon = 'success', position = 'top-end') => {
  const dark = isDarkMode()
  const isSuccess = icon === 'success'
  const isInfo = icon === 'info'
  const isWarning = icon === 'warning'
  const isError = icon === 'error'

  const defaultTitle = isSuccess ? 'SUCCESS' : (isInfo ? 'NOTICE' : (isWarning ? 'WARNING' : 'FAILED'))
  let titleText = defaultTitle
  let bodyText = message

  if (typeof message === 'string') {
    const colonIdx = message.indexOf(': ')
    if (colonIdx > 0 && colonIdx <= 35) {
      titleText = message.slice(0, colonIdx).trim().toUpperCase()
      bodyText = message.slice(colonIdx + 2).trim()
    }
  }

  let bgBadge = dark ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200'
  let titleColor = dark ? 'text-emerald-400' : 'text-emerald-700'
  let progressBarColor = '!bg-emerald-500'
  let iconSvg = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`

  if (isInfo) {
    bgBadge = dark ? 'bg-blue-950/80 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200'
    titleColor = dark ? 'text-blue-400' : 'text-blue-700'
    progressBarColor = '!bg-blue-500'
    iconSvg = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
  } else if (isWarning) {
    bgBadge = dark ? 'bg-amber-950/80 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-600 border-amber-200'
    titleColor = dark ? 'text-amber-400' : 'text-amber-700'
    progressBarColor = '!bg-amber-500'
    iconSvg = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
  } else if (isError) {
    bgBadge = dark ? 'bg-rose-950/80 text-rose-400 border-rose-500/30' : 'bg-rose-50 text-rose-600 border-rose-200'
    titleColor = dark ? 'text-rose-400' : 'text-rose-700'
    progressBarColor = '!bg-rose-500'
    iconSvg = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
  }

  const toastBg = dark ? '!bg-[#0c1612]/95 !border-emerald-500/25 text-white' : '!bg-white/95 !border-slate-200 text-slate-800'
  const closeColor = dark ? '!text-slate-400 hover:!text-white' : '!text-slate-400 hover:!text-slate-700'

  const html = `
    <div class="flex items-center gap-3 w-full py-0.5 text-left">
      <div class="flex-shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center ${bgBadge} shadow-2xs">
        ${iconSvg}
      </div>
      <div class="flex-1 min-w-0 pr-1">
        <div class="text-[10px] font-extrabold uppercase tracking-wider ${titleColor} mb-0.5">
          ${titleText}
        </div>
        <div class="text-xs sm:text-sm font-semibold leading-snug break-words">
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
      popup: `${toastBg} !backdrop-blur-md !border !rounded-2xl !shadow-xl !p-3 !min-w-[280px] !max-w-[420px]`,
      closeButton: `${closeColor} !text-xs focus:!shadow-none`,
      timerProgressBar: progressBarColor,
    }
  })
}

/**
 * Raw Unified SweetAlert wrapper
 * Always enforces the unified branding and returns full Swal result
 */
export const unifiedAlert = (options) => {
  const isDanger = options.isDanger || options.danger || options.icon === 'error' || options.confirmButtonColor === '#ef4444'
  const config = getPopupConfig(options.icon || 'info', isDanger)

  return Swal.fire({
    ...config,
    ...options,
    customClass: {
      ...config.customClass,
      ...(options.customClass || {})
    }
  })
}

export default {
  showToast,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  confirmAction,
  confirmDelete,
  showLoading,
  closeLoading,
  unifiedAlert,
}
