/** One stroke family, 24 px grid. The same path data the design uses. */
export const IC = {
  dash: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z', att: 'M4 5h16v15H4zM4 9h16M9 3v4M15 3v4M8.5 14l2 2 4-4', tt: 'M3 6h18M3 12h18M3 18h18M9 3v18M15 3v18', hw: 'M5 4h11l3 3v13H5zM9 11h6M9 15h6', ex: 'M7 3h10v18H7zM10 8h4M10 12h4M10 16h2',
  stu: 'M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14.6c2.1.6 3.5 2.4 4 5.4', staff: 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4.5 20c.9-3.8 3.9-6 7.5-6s6.6 2.2 7.5 6', adm: 'M4 20V8l8-5 8 5v12M9 20v-6h6v6',
  fee: 'M3 8.5A2.5 2.5 0 0 1 5.5 6H17V3.5M3 8.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7.5a2 2 0 0 0-2-2H3', inv: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6', rep: 'M4 20V10M10 20V4M16 20v-7M21 20H3',
  notice: 'M3.5 10v4a1 1 0 0 0 1 1h3l7 4V5l-7 4h-3a1 1 0 0 0-1 1zM18 8.5a5 5 0 0 1 0 7', msg: 'M4 5h16v11H9l-5 4z', evt: 'M3.5 6.5h17v13h-17zM3.5 10.5h17M8 4v4M16 4v4',
  set: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
  // console
  fleet: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', onb: 'M12 5v14M5 12h14', cells: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  rel: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5', mig: 'M5 4h14v6H5zM5 14h14v6H5zM9 7h.01M9 17h.01', app: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM11 18h2', flag: 'M5 21V4M5 4h12l-2 4 2 4H5',
  health: 'M3 12h4l3-7 4 14 3-7h4', sup: 'M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z', bill: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  team: 'M8 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0M3 20c.7-3.4 3.3-5 7-5s6.3 1.6 7 5M17 4.5a3 3 0 0 1 0 5.8M18.5 14.5c1.6.6 2.6 2.2 3 4.5',
  appr: 'M9 12l2 2 4-4M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7z', bp: 'M5 4h14v4H5zM5 10h14v4H5zM5 16h14v4H5z', mod: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7', inbox: 'M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5',
} as const;
export type IconName = keyof typeof IC;
