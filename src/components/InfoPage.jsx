const TEAM = [
  { name: "Parth Sharma", roll: "C442" },
  { name: "Priyanshu Singh", roll: "C453" },
  { name: "Owais Shaikh", roll: "C433" },
  { name: "Naitik Patni", roll: "C470" },
];

export default function InfoPage({ onBack }) {
  return (
    <div className="info-page">
      <header className="info-page__header">
        <button type="button" className="panel-toggle-btn" onClick={onBack}>
          ← Back to simulation
        </button>
      </header>

      <div className="info-page__body">
        <section className="info-card">
          <h2 className="info-card__title">Presentation</h2>
          <div className="info-page__embed">
            <iframe
              style={{ border: "1px solid rgba(0, 0, 0, 0.1)" }}
              width="800"
              height="450"
              src="https://embed.figma.com/slides/QIoDdaQ0w8ewmzOJE1a5J6/Untitled?node-id=3-46&embed-host=share"
              allowFullScreen
              title="Project presentation"
            />
          </div>
        </section>

        <section className="info-card">
          <h2 className="info-card__title">Team members</h2>
          <ul className="team-grid">
            {TEAM.map((member) => (
              <li key={member.roll} className="team-grid__item">
                <span className="team-grid__name">{member.name}</span>
                <span className="team-grid__roll">Roll no {member.roll}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
