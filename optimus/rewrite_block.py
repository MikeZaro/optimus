from pathlib import Path
import re
path = Path('src/App.jsx')
text = path.read_text()
new_block = """
const reflectionTemplates = [
  (input) => `It sounds like ${input}.`,
  (input) => `You seem to be carrying ${input}.`,
  (input) => `There is a sense of ${input} in what you shared.`,
  (input) => `That feels like ${input}.`,
  (input) => `I hear a lot of ${input} showing up.`,
]

const acknowledgements = [
  'That sounds uncomfortable.',
  'I can hear how heavy that feels.',
  'That seems draining right now.',
  'I imagine that is a lot to carry.',
  'It makes sense that this is weighing on you.',
  'You do not have to make it okay for me; I知 just listening.',
]

const phaseDefinitions = [
  {
    key: 'issue',
    questions: [
      'Can you describe what is happening right now?',
      'What landed for you before you arrived here today?',
    ],
    presence: ['I知 here, simply holding space for this.', 'Thanks for trusting me with that.'],
    grounding: 'I値l stay steady with you as this unfolds.',
  },
  {
    key: 'clarify',
    questions: [
      'Is it the energy or the focus that feels hardest?',
      'Which part is pulling on your attention the most?',
    ],
    presence: ['I知 staying present as you name the experience.', 'We can keep tracing it together.'],
    grounding: 'I値l keep grounding myself in the fact that goals stay the same.',
  },
  {
    key: 'stabilize',
    questions: [
      'What would help you feel steadier before you move forward?',
      'What feels like the smallest next move right now?',
    ],
    presence: ['We can breathe through this before the next action.', 'It痴 okay to pause; I知 here with you.'],
    grounding: 'Let痴 keep this steady and not rush the next step.',
  },
  {
    key: 'close',
    questions: [
      'Is there anything you need before we shift back toward the outcome?',
      'Do you need one more breath before you return to the task?',
    ],
    presence: ['I値l stay quiet here while you gather yourself.', 'You can take the space you need; I知 still here.'],
    grounding: 'I知 with you until you feel ready to keep going.',
  },
]

const interpretationTriggers = {
  avoidance: {
    keywords: ['avoid', 'put off', 'delay', 'resist', 'stuck'],
    adaptation: "We'll keep the direction steady and lighten today with one very small action.",
  },
  overwhelm: {
    keywords: ['overwhelmed', 'too much', 'scattered', 'swamped'],
    adaptation: 'We can lower the difficulty by chunking the next move into a simpler step.',
  },
  anxiety: {
    keywords: ['anxious', 'afraid', 'fear', 'panic', 'nervous', 'worried'],
    adaptation: 'We will not change your goal; we can soften the sequencing so the next move feels manageable.',
  },
  cannotAct: {
    keywords: ['cannot', "can't", 'unable', 'not sure how', 'blocked'],
    adaptation: 'Let痴 reduce the task size and focus on a clear prep step before acting.',
  },
}

const quietPresenceMoves = [
  'I知 still here if you need more time.',
  'Take your time; I値l stay present.',
  'I知 holding this space while you gather your words.',
]

function chooseUnique(pool, recent) {
  if not pool:
    return None
  candidates = [item for item in pool if item not in recent]
  return candidates[0] if candidates else pool[0]
}

function detectInterpretation(text) {
  const normalized = text.toLowerCase()
  return Object.values(interpretationTriggers).find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword))
  )
}

function buildTherapistResponse({
  trimmed,
  currentPhase,
  shouldReflect,
  includeQuestion,
  recentLines,
  phaseIndex,
}) {
  const lines = []
  if (shouldReflect) {
    const reflection =
      reflectionTemplates[
        Math.abs(trimmed.length + trimmed.split(' ').length * 3) % reflectionTemplates.length
      ](trimmed)
    lines.push(reflection)
  }

  const acknowledgement = chooseUnique(acknowledgements, recentLines)
  if (acknowledgement) {
    lines.push(acknowledgement)
  }

  if (includeQuestion) {
    const question = chooseUnique(currentPhase.questions, recentLines)
    if (question) {
      lines.push(question)
    }
  } else {
    const presenceSource = [...currentPhase.presence, ...quietPresenceMoves]
    const presence = chooseUnique(presenceSource, recentLines)
    if (presence) {
      lines.push(presence)
    }
  }

  if (phaseIndex >= 2 && currentPhase.grounding) {
    lines.push(currentPhase.grounding)
  }

  const responseText = lines.join(' ')
  return {
    text: responseText,
    linesUsed: lines,
    includeQuestion,
  }
}
