import { useState } from 'react'

/**
 * The sign itself.
 *
 * A fixed square on a white surface, because UK sign artwork is red, blue and
 * white and only reads correctly against white. The box keeps its size whatever
 * the image does, so nothing on the screen moves while it loads — on a question
 * screen a reflow would shift the answer buttons under the learner's thumb.
 *
 * A merged sign is two or three images shown together as one question. They
 * share the surface and stay large enough to recognise rather than being scaled
 * to fit a single square.
 *
 * If the artwork fails, the question stays answerable: the stage falls back to
 * naming the sign rather than blocking the quiz on an image.
 */

/**
 * - `asked` — the sign in the question, before it is answered.
 * - `answered` — the same sign once the question is resolved. It shrinks on a
 *   phone to make room for the feedback and the action bar, and stays large on
 *   a wide screen, where the extra room is the whole point of a visual test.
 * - `thumbnail` — small at every width, for listing signs in the review.
 */
export type SignStageSize = 'asked' | 'answered' | 'thumbnail'

const SIZES: Record<SignStageSize, string> = {
  asked: 'h-[150px] w-[150px] sm:h-[190px] sm:w-[190px] lg:h-[320px] lg:w-[320px]',
  answered: 'h-[84px] w-[84px] lg:h-[320px] lg:w-[320px]',
  thumbnail: 'h-[84px] w-[84px]',
}

export interface SignStageProps {
  images: string[]
  /**
   * Alternative text for the artwork. While a question is unanswered this must
   * stay neutral — describing what the sign means would hand the answer to a
   * screen reader user and to nobody else. The meaning is only safe here once
   * the question has been answered.
   */
  label: string
  size?: SignStageSize
}

export default function SignStage({ images, label, size = 'asked' }: SignStageProps) {
  const [failed, setFailed] = useState(false)

  return (
    <div
      className={`keyline-plate shrink-0 ${size === 'asked' ? 'mx-auto' : ''}`}
      data-testid="sign-stage"
    >
      <div
        className={`flex items-center justify-center gap-2 rounded-md border border-white/[0.09] bg-white p-3 ${SIZES[size]}`}
      >
        {failed ? (
          <p className="px-1 text-center font-mono text-[9px] uppercase leading-tight tracking-field text-black/55">
            Sign image unavailable
          </p>
        ) : (
          images.map((image, index) => (
            <img
              key={image}
              src={`/signs/${image}`}
              alt={index === 0 ? label : ''}
              aria-hidden={index === 0 ? undefined : true}
              onError={() => setFailed(true)}
              className="h-full min-w-0 flex-1 object-contain"
            />
          ))
        )}
      </div>
    </div>
  )
}
