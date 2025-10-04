export function Footer() {
  return (
    <footer className="footer mt-auto py-4 bg-light border-top">
      <div className="container">
        {/* <div className="row">
          <div className="col-md-6">
            <h5 className="mb-3">FERI Timetable++</h5>
            <p className="text-muted mb-2">
              An improved timetable viewer for FERI UM students.
            </p>
            <p className="text-muted small">
              Made with ❤️ by <a href="https://github.com/AnzeBlaBla" target="_blank" rel="noopener noreferrer" className="text-decoration-none">AnzeBlaBla</a> + a great amount of The Vibe™.
            </p>
          </div>
          <div className="col-md-3">
            <h6 className="mb-3">Quick Links</h6>
            <ul className="list-unstyled">
              <li className="mb-2">
                <a href="/" className="text-muted text-decoration-none hover-primary">
                  <i className="bi bi-house-door me-2"></i>Home
                </a>
              </li>
              <li className="mb-2">
                <a href="https://github.com/AnzeBlaBla/feri-timetable-plus-plus" target="_blank" rel="noopener noreferrer" className="text-muted text-decoration-none hover-primary">
                  <i className="bi bi-github me-2"></i>GitHub
                </a>
              </li>
            </ul>
          </div>
          <div className="col-md-3">
            <h6 className="mb-3">Goal</h6>
            <p className="text-muted small">
              Enable per-course group filtering to help students create personalized timetables by selecting specific groups for each course.
            </p>
          </div>
        </div> */}
        <hr className="my-3" />
        <div className="row">
          <div className="col-12 text-center">
            <p className="text-muted small mb-0">
              © {new Date().getFullYear()} FERI Timetable++. Not affiliated with University of Maribor.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
