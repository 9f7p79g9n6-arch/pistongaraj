import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/constants/theme';

const P: Record<string, string[]> = {
  home: ['M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
  parts: ['M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1'],
  forum: ['M4 5h16v11H8l-4 4z'],
  wrench: ['M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z'],
  user: ['M4 21a8 8 0 0 1 16 0'],
  bell: ['M6 16V11a6 6 0 0 1 12 0v5l2 2H4z', 'M10 20a2 2 0 0 0 4 0'],
  back: ['M15 5l-7 7 7 7'],
  plus: ['M12 5v14M5 12h14'],
  oil: ['M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z'],
  fuel: ['M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M4 21h11M15 9h2l2 2v7a1.5 1.5 0 0 0 3 0V9l-3-3', 'M7 7h5v4H7z'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  doc: ['M6 3h8l4 4v14H6z', 'M14 3v4h4M9 13h6M9 17h6'],
  car: ['M5 16h14M3 16v-3l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v3'],
  chev: ['M9 5l7 7-7 7'],
  check: ['M5 12l5 5 9-10'],
  alert: ['M12 3l10 18H2z', 'M12 10v5M12 18v.5'],
  x: ['M6 6l12 12M18 6L6 18'],
  lock: ['M8 11V8a4 4 0 0 1 8 0v3'],
  gear: ['M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.5 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7 7 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.5-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6A7 7 0 0 0 19 12z'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z'],
  trash: ['M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14'],
  logout: ['M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10'],
  // PISTON SERVİS
  chart: ['M4 20h16', 'M7 20v-6M12 20V8M17 20v-10'],
  // Forum
  play: ['M8 5v14l11-7z'],
  video: ['M3 7h12v10H3z', 'M15 10l6-3v10l-6-3z'],
  flag: ['M5 21V4h12l-2 4 2 4H5'],
  ban: ['M5.6 5.6l12.8 12.8'],
  send: ['M4 12l16-8-6 16-3-7z'],
  search: ['M20 20l-4.5-4.5'],
  users: ['M2 20a6 6 0 0 1 12 0M14 20a6 6 0 0 1 8-5.6'],
  list: ['M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  store: ['M3 9l2-5h14l2 5M4 9v11h16V9M3 9h18M9 20v-6h6v6'],
  swap: ['M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7'],
  menu: ['M4 7h16M4 12h16M4 17h16'],
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {P[name]!.map((d, i) => <Path key={i} d={d} />)}
      {name === 'parts' && <Circle cx={12} cy={12} r={3} />}
      {name === 'user' && <Circle cx={12} cy={8} r={4} />}
      {name === 'gear' && <Circle cx={12} cy={12} r={3} />}
      {name === 'camera' && <Circle cx={12} cy={13} r={3.5} />}
      {name === 'search' && <Circle cx={10.5} cy={10.5} r={6.5} />}
      {name === 'ban' && <Circle cx={12} cy={12} r={9} />}
      {name === 'users' && (<><Circle cx={8} cy={8} r={3.5} /><Circle cx={17} cy={9} r={2.8} /></>)}
      {name === 'lock' && <Rect x={5} y={11} width={14} height={10} rx={2} />}
      {name === 'car' && (<><Circle cx={7.5} cy={16.5} r={1.8} /><Circle cx={16.5} cy={16.5} r={1.8} /></>)}
    </Svg>
  );
}
