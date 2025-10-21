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
                  <h5 className="alert-heading">Service Unavailable</h5>
                  <p className="mb-0">
                    We're experiencing technical difficulties. Please try again later.
                  </p>
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
