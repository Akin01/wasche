// Native SolidJS v2 Lucide Icons
import type { JSX } from '@solidjs/web';

export interface IconProps {
  size?: number | string;
  strokeWidth?: number | string;
  fill?: string;
  class?: string;
  style?: string | JSX.CSSProperties;
  onClick?: (e: MouseEvent) => void;
  title?: string;
}

type SvgNode = [string, Record<string, string | number | undefined>];

function createIcon(dNodes: SvgNode[]) {
  return (props: IconProps) => {
    const size = props.size || 24;
    const stroke = props.strokeWidth || 2;
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={props.fill || 'none'}
        stroke="currentColor"
        stroke-width={stroke}
        stroke-linecap="round"
        stroke-linejoin="round"
        class={props.class}
        style={props.style}
        onClick={props.onClick}
      >
        {dNodes.map(([tag, attrs]) => {
          if (tag === 'path') return <path d={String(attrs.d || '')} />;
          if (tag === 'circle') return <circle cx={attrs.cx} cy={attrs.cy} r={attrs.r} />;
          if (tag === 'rect')
            return (
              <rect
                width={attrs.width}
                height={attrs.height}
                x={attrs.x}
                y={attrs.y}
                rx={attrs.rx}
                ry={attrs.ry}
              />
            );
          if (tag === 'line')
            return <line x1={attrs.x1} y1={attrs.y1} x2={attrs.x2} y2={attrs.y2} />;
          if (tag === 'polyline') return <polyline points={String(attrs.points || '')} />;
          if (tag === 'polygon') return <polygon points={String(attrs.points || '')} />;
          return null;
        })}
      </svg>
    );
  };
}

export const AlertCircle = createIcon([
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '10',
      key: '1mglay'
    }
  ],
  [
    'line',
    {
      x1: '12',
      x2: '12',
      y1: '8',
      y2: '12',
      key: '1pkeuh'
    }
  ],
  [
    'line',
    {
      x1: '12',
      x2: '12.01',
      y1: '16',
      y2: '16',
      key: '4dfq90'
    }
  ]
]);
export const AlertTriangle = createIcon([
  [
    'path',
    {
      d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3',
      key: 'wmoenq'
    }
  ],
  [
    'path',
    {
      d: 'M12 9v4',
      key: 'juzpu7'
    }
  ],
  [
    'path',
    {
      d: 'M12 17h.01',
      key: 'p32p05'
    }
  ]
]);
export const ArrowLeft = createIcon([
  [
    'path',
    {
      d: 'm12 19-7-7 7-7',
      key: '1l729n'
    }
  ],
  [
    'path',
    {
      d: 'M19 12H5',
      key: 'x3x0zl'
    }
  ]
]);
export const Bold = createIcon([
  [
    'path',
    {
      d: 'M6 12h9a4 4 0 010 8H7a1 1 0 01-1-1V5a1 1 0 011-1h7a4 4 0 010 8',
      key: 'n8tvfh'
    }
  ]
]);
export const Camera = createIcon([
  [
    'path',
    {
      d: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z',
      key: '18u6gg'
    }
  ],
  [
    'circle',
    {
      cx: '12',
      cy: '13',
      r: '3',
      key: '1vg3eu'
    }
  ]
]);
export const Check = createIcon([
  [
    'path',
    {
      d: 'M20 6 9 17l-5-5',
      key: '1gmf2c'
    }
  ]
]);
export const CheckCheck = createIcon([
  [
    'path',
    {
      d: 'M18 6 7 17l-5-5',
      key: '116fxf'
    }
  ],
  [
    'path',
    {
      d: 'm22 10-7.5 7.5L13 16',
      key: 'ke71qq'
    }
  ]
]);
export const CheckCircle = createIcon([
  [
    'path',
    {
      d: 'M21.801 10A10 10 0 1 1 17 3.335',
      key: 'yps3ct'
    }
  ],
  [
    'path',
    {
      d: 'm9 11 3 3L22 4',
      key: '1pflzl'
    }
  ]
]);
export const CheckCircle2 = createIcon([
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '10',
      key: '1mglay'
    }
  ],
  [
    'path',
    {
      d: 'm16 9-5.5 5.5L8 12',
      key: 'xofnsj'
    }
  ]
]);
export const ChevronDown = createIcon([
  [
    'path',
    {
      d: 'm6 9 6 6 6-6',
      key: 'qrunsl'
    }
  ]
]);
export const Clock = createIcon([
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '10',
      key: '1mglay'
    }
  ],
  [
    'path',
    {
      d: 'M12 6v6l4 2',
      key: 'mmk7yg'
    }
  ]
]);
export const Code = createIcon([
  [
    'path',
    {
      d: 'm16 18 6-6-6-6',
      key: 'eg8j8'
    }
  ],
  [
    'path',
    {
      d: 'm8 6-6 6 6 6',
      key: 'ppft3o'
    }
  ]
]);
export const Crop = createIcon([
  [
    'path',
    {
      d: 'M6 2v14a2 2 0 0 0 2 2h14',
      key: 'ron5a4'
    }
  ],
  [
    'path',
    {
      d: 'M18 22V8a2 2 0 0 0-2-2H2',
      key: '7s9ehn'
    }
  ]
]);
export const Eye = createIcon([
  [
    'path',
    {
      d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
      key: '1nclc0'
    }
  ],
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '3',
      key: '1v7zrd'
    }
  ]
]);
export const FileText = createIcon([
  [
    'path',
    {
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
      key: '1oefj6'
    }
  ],
  [
    'path',
    {
      d: 'M14 2v5a1 1 0 0 0 1 1h5',
      key: 'wfsgrz'
    }
  ],
  [
    'path',
    {
      d: 'M10 9H8',
      key: 'b1mrlr'
    }
  ],
  [
    'path',
    {
      d: 'M16 13H8',
      key: 't4e002'
    }
  ],
  [
    'path',
    {
      d: 'M16 17H8',
      key: 'z1uh3a'
    }
  ]
]);
export const FileUp = createIcon([
  [
    'path',
    {
      d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
      key: '1oefj6'
    }
  ],
  [
    'path',
    {
      d: 'M14 2v5a1 1 0 0 0 1 1h5',
      key: 'wfsgrz'
    }
  ],
  [
    'path',
    {
      d: 'M12 12v6',
      key: '3ahymv'
    }
  ],
  [
    'path',
    {
      d: 'm15 15-3-3-3 3',
      key: '15xj92'
    }
  ]
]);
export const Film = createIcon([
  [
    'rect',
    {
      width: '18',
      height: '18',
      x: '3',
      y: '3',
      rx: '2',
      key: 'afitv7'
    }
  ],
  [
    'path',
    {
      d: 'M7 3v18',
      key: 'bbkbws'
    }
  ],
  [
    'path',
    {
      d: 'M3 7.5h4',
      key: 'zfgn84'
    }
  ],
  [
    'path',
    {
      d: 'M3 12h18',
      key: '1i2n21'
    }
  ],
  [
    'path',
    {
      d: 'M3 16.5h4',
      key: '1230mu'
    }
  ],
  [
    'path',
    {
      d: 'M17 3v18',
      key: 'in4fa5'
    }
  ],
  [
    'path',
    {
      d: 'M17 7.5h4',
      key: 'myr1c1'
    }
  ],
  [
    'path',
    {
      d: 'M17 16.5h4',
      key: 'go4c1d'
    }
  ]
]);
export const Filter = createIcon([
  [
    'path',
    {
      d: 'M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z',
      key: 'sc7q7i'
    }
  ]
]);
export const HelpCircle = createIcon([
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '10',
      key: '1mglay'
    }
  ],
  [
    'path',
    {
      d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
      key: '1u773s'
    }
  ],
  [
    'path',
    {
      d: 'M12 17h.01',
      key: 'p32p05'
    }
  ]
]);
export const History = createIcon([
  [
    'path',
    {
      d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8',
      key: '1357e3'
    }
  ],
  [
    'path',
    {
      d: 'M3 3v5h5',
      key: '1xhq8a'
    }
  ],
  [
    'path',
    {
      d: 'M12 7v5l4 2',
      key: '1fdv2h'
    }
  ]
]);
export const Image = createIcon([
  [
    'rect',
    {
      width: '18',
      height: '18',
      x: '3',
      y: '3',
      rx: '2',
      ry: '2',
      key: '1m3agn'
    }
  ],
  [
    'circle',
    {
      cx: '9',
      cy: '9',
      r: '2',
      key: 'af1f0g'
    }
  ],
  [
    'path',
    {
      d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
      key: '1xmnt7'
    }
  ]
]);
export const Inbox = createIcon([
  [
    'polyline',
    {
      points: '22 12 16 12 14 15 10 15 8 12 2 12',
      key: 'o97t9d'
    }
  ],
  [
    'path',
    {
      d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
      key: 'oot6mr'
    }
  ]
]);
export const Italic = createIcon([
  [
    'line',
    {
      x1: '19',
      x2: '10',
      y1: '4',
      y2: '4',
      key: '15jd3p'
    }
  ],
  [
    'line',
    {
      x1: '14',
      x2: '5',
      y1: '20',
      y2: '20',
      key: 'bu0au3'
    }
  ],
  [
    'line',
    {
      x1: '15',
      x2: '9',
      y1: '4',
      y2: '20',
      key: 'uljnxc'
    }
  ]
]);
export const KeyRound = createIcon([
  [
    'path',
    {
      d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z',
      key: '1s6t7t'
    }
  ],
  [
    'circle',
    {
      cx: '16.5',
      cy: '7.5',
      r: '.5',
      fill: 'currentColor',
      key: 'w0ekpg'
    }
  ]
]);
export const Layers = createIcon([
  [
    'path',
    {
      d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z',
      key: 'zw3jo'
    }
  ],
  [
    'path',
    {
      d: 'M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12',
      key: '1wduqc'
    }
  ],
  [
    'path',
    {
      d: 'M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17',
      key: 'kqbvx6'
    }
  ]
]);
export const Menu = createIcon([
  [
    'path',
    {
      d: 'M4 5h16',
      key: '1tepv9'
    }
  ],
  [
    'path',
    {
      d: 'M4 12h16',
      key: '1lakjw'
    }
  ],
  [
    'path',
    {
      d: 'M4 19h16',
      key: '1djgab'
    }
  ]
]);
export const Mic = createIcon([
  [
    'path',
    {
      d: 'M12 19v3',
      key: 'npa21l'
    }
  ],
  [
    'path',
    {
      d: 'M19 10v2a7 7 0 0 1-14 0v-2',
      key: '1vc78b'
    }
  ],
  [
    'rect',
    {
      x: '9',
      y: '2',
      width: '6',
      height: '13',
      rx: '3',
      key: 's6n7sd'
    }
  ]
]);
export const MoreVertical = createIcon([
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '1',
      key: '41hilf'
    }
  ],
  [
    'circle',
    {
      cx: '12',
      cy: '5',
      r: '1',
      key: 'gxeob9'
    }
  ],
  [
    'circle',
    {
      cx: '12',
      cy: '19',
      r: '1',
      key: 'lyex9k'
    }
  ]
]);
export const Paintbrush = createIcon([
  [
    'path',
    {
      d: 'm14.622 17.897-10.68-2.913',
      key: 'vj2p1u'
    }
  ],
  [
    'path',
    {
      d: 'M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z',
      key: '18tc5c'
    }
  ],
  [
    'path',
    {
      d: 'M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15',
      key: 'ytzfxy'
    }
  ]
]);
export const Paperclip = createIcon([
  [
    'path',
    {
      d: 'm16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551',
      key: '1miecu'
    }
  ]
]);
export const Pause = createIcon([
  [
    'rect',
    {
      x: '14',
      y: '3',
      width: '5',
      height: '18',
      rx: '1',
      key: 'kaeet6'
    }
  ],
  [
    'rect',
    {
      x: '5',
      y: '3',
      width: '5',
      height: '18',
      rx: '1',
      key: '1wsw3u'
    }
  ]
]);
export const Pencil = createIcon([
  [
    'path',
    {
      d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z',
      key: '1a8usu'
    }
  ],
  [
    'path',
    {
      d: 'm15 5 4 4',
      key: '1mk7zo'
    }
  ]
]);
export const Play = createIcon([
  [
    'path',
    {
      d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
      key: '10ikf1'
    }
  ]
]);
export const Plus = createIcon([
  [
    'path',
    {
      d: 'M5 12h14',
      key: '1ays0h'
    }
  ],
  [
    'path',
    {
      d: 'M12 5v14',
      key: 's699le'
    }
  ]
]);
export const QrCode = createIcon([
  [
    'rect',
    {
      width: '5',
      height: '5',
      x: '3',
      y: '3',
      rx: '1',
      key: '1tu5fj'
    }
  ],
  [
    'rect',
    {
      width: '5',
      height: '5',
      x: '16',
      y: '3',
      rx: '1',
      key: '1v8r4q'
    }
  ],
  [
    'rect',
    {
      width: '5',
      height: '5',
      x: '3',
      y: '16',
      rx: '1',
      key: '1x03jg'
    }
  ],
  [
    'path',
    {
      d: 'M21 16h-3a2 2 0 0 0-2 2v3',
      key: '177gqh'
    }
  ],
  [
    'path',
    {
      d: 'M21 21v.01',
      key: 'ents32'
    }
  ],
  [
    'path',
    {
      d: 'M12 7v3a2 2 0 0 1-2 2H7',
      key: '8crl2c'
    }
  ],
  [
    'path',
    {
      d: 'M3 12h.01',
      key: 'nlz23k'
    }
  ],
  [
    'path',
    {
      d: 'M12 3h.01',
      key: 'n36tog'
    }
  ],
  [
    'path',
    {
      d: 'M12 16v.01',
      key: '133mhm'
    }
  ],
  [
    'path',
    {
      d: 'M16 12h1',
      key: '1slzba'
    }
  ],
  [
    'path',
    {
      d: 'M21 12v.01',
      key: '1lwtk9'
    }
  ],
  [
    'path',
    {
      d: 'M12 21v-1',
      key: '1880an'
    }
  ]
]);
export const Radio = createIcon([
  [
    'path',
    {
      d: 'M16.247 7.761a6 6 0 0 1 0 8.478',
      key: '1fwjs5'
    }
  ],
  [
    'path',
    {
      d: 'M19.075 4.933a10 10 0 0 1 0 14.134',
      key: 'ehdyv1'
    }
  ],
  [
    'path',
    {
      d: 'M4.925 19.067a10 10 0 0 1 0-14.134',
      key: '1q22gi'
    }
  ],
  [
    'path',
    {
      d: 'M7.753 16.239a6 6 0 0 1 0-8.478',
      key: 'r2q7qm'
    }
  ],
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '2',
      key: '1c9p78'
    }
  ]
]);
export const RefreshCw = createIcon([
  [
    'path',
    {
      d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8',
      key: 'v9h5vc'
    }
  ],
  [
    'path',
    {
      d: 'M21 3v5h-5',
      key: '1q7to0'
    }
  ],
  [
    'path',
    {
      d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16',
      key: '3uifl3'
    }
  ],
  [
    'path',
    {
      d: 'M8 16H3v5',
      key: '1cv678'
    }
  ]
]);
export const RotateCcw = createIcon([
  [
    'path',
    {
      d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8',
      key: '1357e3'
    }
  ],
  [
    'path',
    {
      d: 'M3 3v5h5',
      key: '1xhq8a'
    }
  ]
]);
export const RotateCw = createIcon([
  [
    'path',
    {
      d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8',
      key: '1p45f6'
    }
  ],
  [
    'path',
    {
      d: 'M21 3v5h-5',
      key: '1q7to0'
    }
  ]
]);
export const Scissors = createIcon([
  [
    'circle',
    {
      cx: '6',
      cy: '6',
      r: '3',
      key: '1lh9wr'
    }
  ],
  [
    'path',
    {
      d: 'M8.12 8.12 12 12',
      key: '1alkpv'
    }
  ],
  [
    'path',
    {
      d: 'M20 4 8.12 15.88',
      key: 'xgtan2'
    }
  ],
  [
    'circle',
    {
      cx: '6',
      cy: '18',
      r: '3',
      key: 'fqmcym'
    }
  ],
  [
    'path',
    {
      d: 'M14.8 14.8 20 20',
      key: 'ptml3r'
    }
  ]
]);
export const Search = createIcon([
  [
    'path',
    {
      d: 'm21 21-4.34-4.34',
      key: '14j7rj'
    }
  ],
  [
    'circle',
    {
      cx: '11',
      cy: '11',
      r: '8',
      key: '4ej97u'
    }
  ]
]);
export const Send = createIcon([
  [
    'path',
    {
      d: 'M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z',
      key: '1ffxy3'
    }
  ],
  [
    'path',
    {
      d: 'm21.854 2.147-10.94 10.939',
      key: '12cjpa'
    }
  ]
]);
export const Sliders = createIcon([
  [
    'path',
    {
      d: 'M10 8h4',
      key: '1sr2af'
    }
  ],
  [
    'path',
    {
      d: 'M12 21v-9',
      key: '17s77i'
    }
  ],
  [
    'path',
    {
      d: 'M12 8V3',
      key: '13r4qs'
    }
  ],
  [
    'path',
    {
      d: 'M17 16h4',
      key: 'h1uq16'
    }
  ],
  [
    'path',
    {
      d: 'M19 12V3',
      key: 'o1uvq1'
    }
  ],
  [
    'path',
    {
      d: 'M19 21v-5',
      key: 'qua636'
    }
  ],
  [
    'path',
    {
      d: 'M3 14h4',
      key: 'bcjad9'
    }
  ],
  [
    'path',
    {
      d: 'M5 10V3',
      key: 'cb8scm'
    }
  ],
  [
    'path',
    {
      d: 'M5 21v-7',
      key: '1w1uti'
    }
  ]
]);
export const Smartphone = createIcon([
  [
    'rect',
    {
      width: '14',
      height: '20',
      x: '5',
      y: '2',
      rx: '2',
      ry: '2',
      key: '1yt0o3'
    }
  ],
  [
    'path',
    {
      d: 'M12 18h.01',
      key: 'mhygvu'
    }
  ]
]);
export const Smile = createIcon([
  [
    'path',
    {
      d: 'M15 10V9',
      key: '4dkmfx'
    }
  ],
  [
    'path',
    {
      d: 'M16.472 15a6 6 0 01-8.943 0',
      key: '7qomzy'
    }
  ],
  [
    'path',
    {
      d: 'M9 10V9',
      key: '1lazqi'
    }
  ],
  [
    'circle',
    {
      cx: '12',
      cy: '12',
      r: '10',
      key: '1mglay'
    }
  ]
]);
export const Sparkles = createIcon([
  [
    'path',
    {
      d: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z',
      key: '1s2grr'
    }
  ],
  [
    'path',
    {
      d: 'M20 2v4',
      key: '1rf3ol'
    }
  ],
  [
    'path',
    {
      d: 'M22 4h-4',
      key: 'gwowj6'
    }
  ],
  [
    'circle',
    {
      cx: '4',
      cy: '20',
      r: '2',
      key: '6kqj1y'
    }
  ]
]);
export const Square = createIcon([
  [
    'rect',
    {
      width: '18',
      height: '18',
      x: '3',
      y: '3',
      rx: '2',
      key: 'afitv7'
    }
  ]
]);
export const Trash2 = createIcon([
  [
    'path',
    {
      d: 'M10 11v6',
      key: 'nco0om'
    }
  ],
  [
    'path',
    {
      d: 'M14 11v6',
      key: 'outv1u'
    }
  ],
  [
    'path',
    {
      d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
      key: 'miytrc'
    }
  ],
  [
    'path',
    {
      d: 'M3 6h18',
      key: 'd0wm0j'
    }
  ],
  [
    'path',
    {
      d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
      key: 'e791ji'
    }
  ]
]);
export const Type = createIcon([
  [
    'path',
    {
      d: 'M12 4v16',
      key: '1654pz'
    }
  ],
  [
    'path',
    {
      d: 'M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2',
      key: 'e0r10z'
    }
  ],
  [
    'path',
    {
      d: 'M9 20h6',
      key: 's66wpe'
    }
  ]
]);
export const Undo2 = createIcon([
  [
    'path',
    {
      d: 'M9 14 4 9l5-5',
      key: '102s5s'
    }
  ],
  [
    'path',
    {
      d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11',
      key: 'f3b9sd'
    }
  ]
]);
export const Users = createIcon([
  [
    'path',
    {
      d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2',
      key: '1yyitq'
    }
  ],
  [
    'path',
    {
      d: 'M16 3.128a4 4 0 0 1 0 7.744',
      key: '16gr8j'
    }
  ],
  [
    'path',
    {
      d: 'M22 21v-2a4 4 0 0 0-3-3.87',
      key: 'kshegd'
    }
  ],
  [
    'circle',
    {
      cx: '9',
      cy: '7',
      r: '4',
      key: 'nufk8'
    }
  ]
]);
export const Video = createIcon([
  [
    'path',
    {
      d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5',
      key: 'ftymec'
    }
  ],
  [
    'rect',
    {
      x: '2',
      y: '6',
      width: '14',
      height: '12',
      rx: '2',
      key: '158x01'
    }
  ]
]);
export const Volume2 = createIcon([
  [
    'path',
    {
      d: 'M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z',
      key: 'uqj9uw'
    }
  ],
  [
    'path',
    {
      d: 'M16 9a5 5 0 0 1 0 6',
      key: '1q6k2b'
    }
  ],
  [
    'path',
    {
      d: 'M19.364 18.364a9 9 0 0 0 0-12.728',
      key: 'ijwkga'
    }
  ]
]);
export const VolumeX = createIcon([
  [
    'path',
    {
      d: 'M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z',
      key: '1p7khw'
    }
  ],
  [
    'path',
    {
      d: 'm16.5 14.5 5-5',
      key: 'cul3yw'
    }
  ],
  [
    'path',
    {
      d: 'm16.5 9.5 5 5',
      key: '1akey5'
    }
  ]
]);
export const X = createIcon([
  [
    'path',
    {
      d: 'M18 6 6 18',
      key: '1bl5f8'
    }
  ],
  [
    'path',
    {
      d: 'm6 6 12 12',
      key: 'd8bk6v'
    }
  ]
]);
export const Zap = createIcon([
  [
    'path',
    {
      d: 'M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z',
      key: '1v7up4'
    }
  ]
]);
export const ImageIcon = Image;
