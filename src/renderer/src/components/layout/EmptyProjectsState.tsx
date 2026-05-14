interface EmptyProjectsStateProps {
  onCreate: () => void
}

export function EmptyProjectsState({ onCreate }: EmptyProjectsStateProps): JSX.Element {
  return (
    <div className="empty-projects-state" role="region" aria-labelledby="empty-projects-title">
      <h2 id="empty-projects-title">Welcome to TokenLess</h2>
      <p>You don't have any projects yet. Create one to get started.</p>
      <button type="button" className="btn btn--primary" onClick={onCreate}>
        Create your first project
      </button>
    </div>
  )
}
