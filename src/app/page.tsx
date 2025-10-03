import { getProgrammes } from '@/lib/timetable-server';
import { ProgrammeSelectionForm } from '@/components/ProgrammeSelectionForm';
import { Programme } from '@/types/types';

export default async function Home() {
  let programmes: Programme[] = [];
  let error = null;

  try {
    // Fetch programmes on the server
    programmes = await getProgrammes();
  } catch (e) {
    console.error('Failed to fetch programmes:', e);
    error = e instanceof Error ? e.message : 'Failed to load programmes';
    programmes = [];
  }

  if (error) {
    return (
      <div className="container mt-5">
        <div className="row justify-content-center">
          <div className="col-md-10 col-lg-8">
            <div className="card shadow">
              <div className="card-body">
                <h1 className="card-title text-center mb-4">
                  FERI Timetable++
                </h1>
                <p className="text-muted text-center mb-4">
                  Select your programme and year to get started
                </p>

                <div className="alert alert-danger" role="alert">
                  <h5 className="alert-heading">Configuration Error</h5>
                  <p className="mb-3">
                    Failed to load programmes. Please ensure environment variables are configured.
                  </p>
                  <hr />
                  <details>
                    <summary className="mb-2" style={{ cursor: 'pointer' }}>Error details</summary>
                    <pre className="small bg-light p-2 rounded">{error}</pre>
                  </details>
                  <div className="mt-3">
                    <p className="fw-bold mb-2">To fix this issue:</p>
                    <ol className="small">
                      <li>Copy <code>.env.example</code> to <code>.env.local</code></li>
                      <li>Add your WTT_USERNAME and WTT_PASSWORD credentials</li>
                      <li>Restart the development server</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-10 col-lg-8">
          <div className="card shadow">
            <div className="card-body">
              <h1 className="card-title text-center mb-4">FERI Timetable++</h1>
              <p className="text-muted text-center mb-4">
                Select your programme and year to get started
              </p>

              <ProgrammeSelectionForm programmes={programmes} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
