export type Condition = 'video_game' | 'youtube' | 'no_screen';

export const CONDITIONS: Condition[] = ['video_game', 'youtube', 'no_screen'];

export const BREAK_SECONDS = 15 * 60;

/** Fixed Corsi presentation timing — identical for every participant. */
export const CORSI_TIMING = {
  /** Pause after "Watch" appears and before the first block lights. */
  preSequenceMs: 1000,
  /** How long each block stays lit. */
  blockOnMs: 1000,
  /** Dark interval between two consecutive blocks. */
  interBlockMs: 500,
  /** How long the correct / incorrect feedback is shown. */
  feedbackMs: 1200,
  /** Flash duration when the participant taps a block. */
  tapFlashMs: 200
} as const;

export const CORSI_RULES = {
  blocks: 9,
  startLength: 2,
  maxLength: 9,
  attemptsPerLength: 2
} as const;

export interface ConditionInfo {
  key: Condition;
  title: string;
  short: string;
  description: string;
  instructions: string[];
  timerPrompt: string;
  accent: string;
}

export const CONDITION_INFO: Record<Condition, ConditionInfo> = {
  video_game: {
    key: 'video_game',
    title: 'Video Game Break',
    short: 'Video Game',
    description: 'Spend 15 minutes playing your favorite video game.',
    instructions: [
      'Play your favorite video game continuously for the full 15 minutes.',
      'Keep this page open — you can switch apps or devices; the timer keeps running.',
      'Come back when the timer reaches 0:00. The Corsi test starts right after.'
    ],
    timerPrompt: 'Please play your favorite video game until the timer reaches zero.',
    accent: '#3987e5'
  },
  youtube: {
    key: 'youtube',
    title: 'YouTube Break',
    short: 'YouTube',
    description: 'Spend 15 minutes watching YouTube.',
    instructions: [
      'Watch YouTube continuously for the full 15 minutes (any videos you like).',
      'Keep this page open in a tab — the timer keeps running in the background.',
      'Come back when the timer reaches 0:00. The Corsi test starts right after.'
    ],
    timerPrompt: 'Please watch YouTube until the timer reaches zero.',
    accent: '#d95926'
  },
  no_screen: {
    key: 'no_screen',
    title: 'No-Screen Break',
    short: 'No-Screen',
    description: 'Spend 15 minutes taking a break without using electronic screens.',
    instructions: [
      'Put your devices aside: no phone, TV, computer, tablet or game screens.',
      'Relax, sit quietly, stretch, have a drink, or do another calm screen-free activity.',
      'Come back when 15 minutes have passed — the timer keeps running while you are away.'
    ],
    timerPrompt: 'Please take a screen-free break until the timer reaches zero.',
    accent: '#199e70'
  }
};

export const CONSENT_ITEMS = [
  {
    key: 'participation',
    title: 'Participation',
    text: 'I agree to participate in this experiment and understand that my results will be recorded and analyzed for research purposes.'
  },
  {
    key: 'quiet',
    title: 'Quiet Environment',
    text: 'I confirm that I am in a quiet environment where I can concentrate without distractions.'
  },
  {
    key: 'guidelines',
    title: 'Experiment Guidelines',
    text: 'I agree to follow all experiment guidelines and instructions, complete the test honestly, and avoid outside assistance.'
  }
] as const;
