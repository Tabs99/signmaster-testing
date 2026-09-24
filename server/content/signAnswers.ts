/**
 * Shortened answer options.
 *
 * The client's mapping spreadsheet is the source of truth for what every sign
 * means, and its full wording is always what the learner reads after answering.
 * A handful of those meanings are long enough that, set as one of four options
 * on a 375px screen, they would run past two lines and make the option list
 * unreadable.
 *
 * Each entry below is a shortened form of that sign's meaning, used only in the
 * option list. Nothing here introduces information the client's description
 * does not already carry, and nothing that changes what the sign means is
 * dropped — qualifiers that only add detail (where a plate may be mounted,
 * which units a figure is shown in) are.
 *
 * Signs not listed here use their full meaning as the option text.
 */
export const SHORTENED_ANSWERS: Readonly<Record<string, string>> = {
  s028: 'Worded warning, such as Ford, Flood, Gate or No smoking',
  s037: 'Stop at the line, then enter the major road only when it is clear',
  s053: 'Maximum speed, in miles per hour, if it is safe to do so',
  s054: 'The national speed limit applies',
  s055: 'Minimum speed permitted, in miles per hour',
  s059: 'No vehicles over the height shown may pass this sign',
  s062: 'Advance warning of light signals at a level crossing',
  s068: 'With flow bus lane ahead, also for pedal cycles and taxis',
  s069: 'Contraflow bus lane, the arrows show the lanes available',
  s071: 'No waiting except for loading during the period shown',
  s073: 'Free parking, Monday to Saturday 8 am to 7 pm, 20 minute limit',
  s080: 'Traffic joins from the left in 200 yards, you have priority',
  s081: 'Sign located where the motorway ends',
  s082: 'Keep at least two chevrons from the vehicle ahead',
  s085: 'Traffic may not use the lane below this gantry signal',
  s086: 'Traffic joins from the right ahead, you have priority',
  s095: 'Countdown markers to the deceleration lane, each bar about 100 yards',
  s097: 'Maximum speed advised, in miles per hour, at a bend',
  s101: 'Electrified overhead cable and the safe height beneath it',
}

/**
 * The longest an option is allowed to be. Two lines at option width on the
 * narrowest supported screen, which is where the quiz layout is tightest.
 */
export const MAX_ANSWER_LENGTH = 70
