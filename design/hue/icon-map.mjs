// One meaning, one icon. The boards ([[i:@fees]]), the web set (code/icons.ts) and the app set (code/app_icons.dart) all read this.
// Values are Phosphor names (packages/phosphor_flutter). Rules: README "Icons".

// Pages, modules and tabs: regular, and fill when selected.
export const PAGES = {
  // school admin
  dashboard: 'squares-four', attendance: 'calendar-check', timetable: 'table', homework: 'notebook', exams: 'exam',
  students: 'student', staff: 'identification-badge', admissions: 'user-plus',
  fees: 'wallet', invoices: 'receipt', payments: 'credit-card', reports: 'chart-bar',
  notices: 'megaphone', messages: 'chat-circle', events: 'confetti', gallery: 'image',
  year: 'calendar-dots', moving: 'arrow-square-in', library: 'books', transport: 'bus', setup: 'gear-six',
  // console
  fleet: 'buildings', onboarding: 'rocket-launch', modules: 'puzzle-piece', cells: 'hard-drives', releases: 'package',
  migrations: 'git-branch', builds: 'device-mobile', flags: 'flag', blueprints: 'compass-tool', integrations: 'plugs-connected',
  health: 'heartbeat', approvals: 'seal-check', requests: 'tray', support: 'lifebuoy', inbox: 'envelope-simple',
  billing: 'bank', compliance: 'shield-check', team: 'users-three',
  // school admin pages added since the boards
  audit: 'list-magnifying-glass', privacy: 'lock-key',
  // app tabs and header
  home: 'house', classes: 'chalkboard-teacher', profile: 'user-circle', notifications: 'bell',
};

// Everyday actions and objects inside pages: regular at 20 px (bold below that, like every icon).
export const UI = {
  search: 'magnifying-glass', calendar: 'calendar-blank', calendarAdd: 'calendar-plus', person: 'user', people: 'users', send: 'paper-plane-tilt',
  download: 'download-simple', upload: 'upload-simple', print: 'printer', phone: 'phone', mobile: 'device-mobile', mail: 'envelope-simple',
  time: 'clock', warning: 'warning', info: 'info', star: 'star', pause: 'pause', play: 'play', bolt: 'lightning', drag: 'dots-six-vertical',
  layers: 'stack', pulse: 'pulse', undo: 'arrow-counter-clockwise', redo: 'arrow-clockwise', card: 'credit-card', edit: 'pencil-simple',
  lock: 'lock-simple', show: 'eye', hide: 'eye-slash', hash: 'hash', sidebar: 'sidebar-simple', columns: 'columns', grid: 'squares-four',
  shield: 'shield', copy: 'copy', link: 'link', trash: 'trash', filter: 'funnel', sort: 'sort-ascending', open: 'arrow-square-out',
  signOut: 'sign-out', light: 'sun', dark: 'moon', breakTime: 'coffee', checkCircle: 'check-circle', file: 'file-text', attach: 'paperclip',
  image: 'image', camera: 'camera', map: 'map-pin', route: 'path', globe: 'globe', key: 'key', archive: 'archive', refresh: 'arrows-clockwise',
};

// Small symbols and statuses: always bold, 14 or 16 px.
export const GLYPHS = {
  check: 'check', close: 'x', plus: 'plus', minus: 'minus', more: 'dots-three', next: 'arrow-right',
  caretDown: 'caret-down', caretUp: 'caret-up', caretLeft: 'caret-left', caretRight: 'caret-right', caretUpDown: 'caret-up-down',
  present: 'check', absent: 'x', late: 'clock', waiting: 'clock', up: 'arrow-up', down: 'arrow-down', upRight: 'arrow-up-right',
  downRight: 'arrow-down-right', alert: 'exclamation-mark', back: 'arrow-left',
};

// The four sizes (px). The phone status bar in the boards is drawn OS chrome and is exempt.
export const SIZES = { xs: 14, s: 16, m: 20, l: 24 };
