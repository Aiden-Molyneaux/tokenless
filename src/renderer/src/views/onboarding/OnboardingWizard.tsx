import { useState } from 'react'
import { writeSetting } from '../../hooks/use-settings'
import { SETTING_ONBOARDING_COMPLETE } from '@shared/types/settings-keys'
import { StepWelcome } from './StepWelcome'
import { StepApiKey } from './StepApiKey'
import { StepFirstProject } from './StepFirstProject'
import { StepDone } from './StepDone'
import './styles.css'

type Step = 'welcome' | 'api-key' | 'first-project' | 'done'

const STEPS: Step[] = ['welcome', 'api-key', 'first-project', 'done']

interface OnboardingWizardProps {
  onClose: () => void
}

export function OnboardingWizard({ onClose }: OnboardingWizardProps): JSX.Element {
  const [step, setStep] = useState<Step>('welcome')
  const [apiKey, setApiKey] = useState('')
  const [projectName, setProjectName] = useState('')
  const [projectRootPath, setProjectRootPath] = useState('')
  const [createdAccountId, setCreatedAccountId] = useState<number | null>(null)

  const handleComplete = async (): Promise<void> => {
    await writeSetting(SETTING_ONBOARDING_COMPLETE, '1')
    onClose()
  }

  const handleSkip = (): void => {
    // Skip does NOT set onboarding.complete — the wizard reappears next launch so
    // users who skipped accidentally get another chance.
    onClose()
  }

  return (
    <div className="onboarding-wizard" role="dialog" aria-modal="true" aria-label="TokenLess onboarding">
      <div className="onboarding-wizard__shell">
        <button type="button" className="onboarding-wizard__skip" onClick={handleSkip}>
          Skip
        </button>
        <div className="onboarding-wizard__progress" aria-hidden="true">
          {STEPS.map((s) => (
            <span
              key={s}
              className={`onboarding-wizard__step-dot${s === step ? ' is-active' : ''}`}
            />
          ))}
        </div>
        {step === 'welcome' && (
          <StepWelcome onNext={() => setStep('api-key')} />
        )}
        {step === 'api-key' && (
          <StepApiKey
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
            onNext={(accountId) => {
              setCreatedAccountId(accountId)
              setStep('first-project')
            }}
            onBack={() => setStep('welcome')}
          />
        )}
        {step === 'first-project' && (
          <StepFirstProject
            projectName={projectName}
            onProjectNameChange={setProjectName}
            projectRootPath={projectRootPath}
            onProjectRootPathChange={setProjectRootPath}
            createdAccountId={createdAccountId}
            onNext={() => setStep('done')}
            onBack={() => setStep('api-key')}
          />
        )}
        {step === 'done' && (
          <StepDone onComplete={handleComplete} />
        )}
      </div>
    </div>
  )
}
