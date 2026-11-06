import type { DotMood } from '../components/brand/dot';
import type { MascotState } from '../shared/engagement/mascots';

/** Which of Dot's nine moods fits an engagement state. Dot is the only mascot. */
export function dotMoodForState(state: MascotState): DotMood {
  switch (state) {
    case 'welcome_back':
    case 'reunion':
      return 'miss';
    case 'celebrate':
    case 'proud':
    case 'perfect':
    case 'level_up':
    case 'goal':
    case 'graduation':
      return 'cheer';
    case 'halfway':
    case 'almost':
    case 'retry':
      return 'determined';
    case 'help':
    case 'stuck':
    case 'message_feedback':
      return 'think';
    case 'encourage':
      return 'wink';
    case 'rest':
      return 'sleep';
    default:
      return 'happy';
  }
}
