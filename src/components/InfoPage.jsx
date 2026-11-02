const TEAM = [
  { name: "Parth Sharma", roll: "C442", image: "team/parth.jpg", initials: "PS" },
  { name: "Priyanshu Singh", roll: "C453", image: "team/priyanshu.png", initials: "PS" },
  { name: "Owais Shaikh", roll: "C433", image: "team/owais.png", initials: "OS" },
  { name: "Naitik Patni", roll: "C470", image: "team/naitik.png", initials: "NP" },
];

const RESEARCH_LINKS = [
  {
    label: "Whale-inspired leading-edge tubercles",
    href: "https://doi.org/10.1098/rspa.2004.1343",
    detail: "Journal of the Royal Society Interface",
  },
  {
    label: "Noise reduction from owl-wing serrations",
    href: "https://doi.org/10.1121/1.3651812",
    detail: "The Journal of the Acoustical Society of America",
  },
  {
    label: "Maple-seed autorotation and passive flight",
    href: "https://doi.org/10.1098/rsif.2012.0393",
    detail: "Journal of the Royal Society Interface",
  },
  {
    label: "Flexible bat wings and aerodynamic control",
    href: "https://doi.org/10.1242/jeb.013268",
    detail: "Journal of Experimental Biology",
  },
];

const DOCUMENTATION_LINKS = [
  { label: "React documentation", href: "https://react.dev/" },
  { label: "Vite documentation", href: "https://vite.dev/guide/" },
  { label: "Stable Fluids paper", href: "https://doi.org/10.1145/311535.311548" },
];

function ResourceList({ links }) {
  return (
    <ul className="resource-list">
      {links.map((link) => (
        <li key={link.href} className="resource-list__item">
          <a href={link.href} target="_blank" rel="noreferrer">
            <span>{link.label}</span>
            {link.detail && <small>{link.detail}</small>}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function InfoPage({ onBack }) {
  return (
    <div className="info-page">
      <header className="info-page__header">
        <div className="info-page__header-inner">
          <button type="button" className="panel-toggle-btn" onClick={onBack}>
            ← Back to simulation
          </button>
          <div className="info-page__intro">
            <span className="info-page__eyebrow">BIOMIMICRY WIND TURBINE</span>
            <h1>Project information</h1>
            <p>Explore the presentation, meet the team, and follow the research behind the simulation.</p>
          </div>
        </div>
      </header>

      <div className="info-page__body">
        <section className="info-card">
          <div className="info-card__heading">
            <div>
              <span className="info-card__eyebrow">01 / OVERVIEW</span>
              <h2 className="info-card__title">Project presentation</h2>
            </div>
            <span className="info-card__badge">Slides</span>
          </div>
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
          <div className="info-card__heading">
            <div>
              <span className="info-card__eyebrow">02 / CONTRIBUTORS</span>
              <h2 className="info-card__title">Team members</h2>
            </div>
            <span className="info-card__badge">{TEAM.length} members</span>
          </div>
          <ul className="team-grid">
            {TEAM.map((member) => (
              <li key={member.roll} className="team-grid__item">
                <div className="team-grid__photo-wrap">
                  {member.image ? (
                    <img
                      className="team-grid__photo"
                      src={`${import.meta.env.BASE_URL}${member.image}`}
                      alt={`${member.name} portrait`}
                    />
                  ) : (
                    <span className="team-grid__photo team-grid__photo--placeholder" aria-hidden="true">
                      {member.initials}
                    </span>
                  )}
                </div>
                <span className="team-grid__label">
                  <span className="team-grid__name">{member.name}</span>
                  <span className="team-grid__roll">Roll no {member.roll}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="info-resource-grid">
          <section className="info-card">
            <div className="info-card__heading">
              <div>
                <span className="info-card__eyebrow">03 / REFERENCES</span>
                <h2 className="info-card__title">Research</h2>
              </div>
              <span className="info-card__badge">{RESEARCH_LINKS.length} papers</span>
            </div>
            <ResourceList links={RESEARCH_LINKS} />
          </section>

          <section className="info-card">
            <div className="info-card__heading">
              <div>
                <span className="info-card__eyebrow">04 / BUILD NOTES</span>
                <h2 className="info-card__title">Documentation</h2>
              </div>
              <span className="info-card__badge">{DOCUMENTATION_LINKS.length} links</span>
            </div>
            <ResourceList links={DOCUMENTATION_LINKS} />
          </section>
        </div>
      </div>
    </div>
  );
}
