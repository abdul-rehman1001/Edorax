import { configureFeedbackAudio } from '@buildment/learning-ui/lib/sound-feedback';
import celebration from '@buildment/learning-ui/assets/sounds/celebration.wav?url';
import completion from '@buildment/learning-ui/assets/sounds/completion.wav?url';
import success from '@buildment/learning-ui/assets/sounds/success.wav?url';
import error from '@buildment/learning-ui/assets/sounds/error.wav?url';
configureFeedbackAudio({ celebration, completion, success, error });
export { playFeedback } from '@buildment/learning-ui/lib/sound-feedback';
