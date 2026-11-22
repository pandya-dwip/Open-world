import { CHANGES_NOTE, CREDITS } from '../../environment/credits.js'

/** Attribution for the third-party assets (required by their CC BY licenses). */
export default function CreditsPanel({ onClose }) {
  return (
    <div className="credits" role="dialog" aria-modal="true" aria-labelledby="credits-title">
      <div className="credits-box">
        <h2 id="credits-title">Credits</h2>
        <ul>
          {CREDITS.map((c) => (
            <li key={c.title}>
              <a href={c.source} target="_blank" rel="noreferrer">
                {c.title}
              </a>{' '}
              by {c.author} —{' '}
              <a href={c.license.url} target="_blank" rel="noreferrer">
                {c.license.name}
              </a>
            </li>
          ))}
        </ul>
        <p className="credits-note">{CHANGES_NOTE}</p>
        <button type="button" onClick={onClose} autoFocus>
          Close
        </button>
      </div>
    </div>
  )
}
