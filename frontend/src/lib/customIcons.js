import { GenIcon } from 'react-icons'
import {
  FiFileText,
  FiEye,
  FiAlertCircle,
  FiTrash2,
  FiShoppingBag,
  FiCreditCard,
  FiShoppingCart,
  FiHelpCircle,
  FiChevronRight,
  FiBell,
} from 'react-icons/fi'

export function TbCurrencyPeso(props) {
  return GenIcon({
    tag: 'svg',
    attr: {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    child: [
      { tag: 'path', attr: { d: 'M8 19v-14h3.5a4.5 4.5 0 1 1 0 9h-3.5' }, child: [] },
      { tag: 'path', attr: { d: 'M18 8h-12' }, child: [] },
      { tag: 'path', attr: { d: 'M18 11h-12' }, child: [] },
    ],
  })(props)
}

export function BiWallet(props) {
  return GenIcon({
    tag: 'svg',
    attr: { viewBox: '0 0 24 24' },
    child: [
      { tag: 'path', attr: { d: 'M16 12h2v4h-2z' }, child: [] },
      {
        tag: 'path',
        attr: {
          d: 'M20 7V5c0-1.103-.897-2-2-2H5C3.346 3 2 4.346 2 6v12c0 2.201 1.794 3 3 3h15c1.103 0 2-.897 2-2V9c0-1.103-.897-2-2-2zM5 5h13v2H5a1.001 1.001 0 0 1 0-2zm15 14H5.012C4.55 18.988 4 18.805 4 18V8.815c.314.113.647.185 1 .185h15v10z',
        },
        child: [],
      },
    ],
  })(props)
}

export function Wallet(props) {
  return GenIcon({
    tag: 'svg',
    attr: {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '2',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    child: [
      {
        tag: 'path',
        attr: {
          d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1',
        },
        child: [],
      },
      {
        tag: 'path',
        attr: { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' },
        child: [],
      },
    ],
  })(props)
}

export {
  FiFileText as FileText,
  FiEye as Eye,
  FiAlertCircle as AlertCircle,
  FiTrash2 as Trash2,
  FiShoppingBag as ShoppingBag,
  FiCreditCard as CreditCard,
  FiShoppingCart as ShoppingCart,
  FiHelpCircle as HelpCircle,
  FiChevronRight as ChevronRight,
  FiBell as Bell,
}
