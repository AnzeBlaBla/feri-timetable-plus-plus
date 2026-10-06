'use client';

import { useCallback, useState } from 'react';
import { SelectedGroups } from '@/types/timetable';

interface McpConnectionModalProps {
  programmeId: string;
  year: string;
  branches: string;
  selectedGroups: SelectedGroups;
}

function encodeGroups(groups: SelectedGroups): string {
  const json = JSON.stringify(groups);
  const base64 = btoa(unescape(encodeURIComponent(json)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export function McpConnectionModal({
  programmeId,
  year,
  branches,
  selectedGroups,
}: McpConnectionModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');

  const getServerUrl = useCallback(() => {
    const params = new URLSearchParams({
      programme: programmeId,
      year,
      branches,
      groups: encodeGroups(selectedGroups),
    });

    return `${window.location.origin}/api/mcp?${params.toString()}`;
  }, [programmeId, year, branches, selectedGroups]);

  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied to clipboard.`);
    } catch (error) {
      console.error(`Failed to copy ${label.toLowerCase()}:`, error);
      setCopyMessage(`Could not copy ${label.toLowerCase()}.`);
    }
  };

  const openDialog = () => {
    setCopyMessage('');
    setIsOpen(true);
  };

  const serverUrl = isOpen ? getServerUrl() : '';
  const config = serverUrl
    ? JSON.stringify(
        {
          mcpServers: {
            'feri-timetable': {
              url: serverUrl,
            },
          },
        },
        null,
        2
      )
    : '';

  return (
    <>
      <button
        className="btn btn-sm btn-outline-primary"
        type="button"
        onClick={openDialog}
        title="Connect this timetable to an MCP client"
      >
        <i className="bi bi-plug"></i>{' '}
        <span className="d-none d-md-inline">Connect MCP</span>
      </button>

      {isOpen && (
        <div
          className="modal d-block"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcpConnectionTitle"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 1060 }}
        >
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="mcpConnectionTitle">
                  Connect this timetable to an MCP client
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setIsOpen(false)}
                />
              </div>
              <div className="modal-body">
                <p>
                  Add this remote server URL to an MCP-compatible client. It is
                  read-only and includes your current programme, year, branch,
                  and group selection.
                </p>
                <label className="form-label fw-bold" htmlFor="mcp-server-url">
                  Server URL
                </label>
                <div className="input-group mb-3">
                  <input
                    id="mcp-server-url"
                    className="form-control"
                    type="text"
                    value={serverUrl}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    className="btn btn-outline-primary"
                    type="button"
                    onClick={() => copyToClipboard(serverUrl, 'Server URL')}
                  >
                    Copy
                  </button>
                </div>

                <label className="form-label fw-bold" htmlFor="mcp-server-config">
                  Generic configuration
                </label>
                <p className="small text-muted">
                  For clients that accept an <code>mcpServers</code>{' '}
                  configuration object, adapt this example to that client’s
                  configuration file.
                </p>
                <div className="position-relative">
                  <textarea
                    id="mcp-server-config"
                    className="form-control font-monospace"
                    rows={8}
                    value={config}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    className="btn btn-sm btn-outline-primary mt-2"
                    type="button"
                    onClick={() => copyToClipboard(config, 'Configuration')}
                  >
                    Copy configuration
                  </button>
                </div>

                <div className="alert alert-warning small mt-3 mb-0" role="alert">
                  Anyone with this URL can view the timetable selection it
                  contains. Share it only with clients and people you trust.
                </div>
                {copyMessage && (
                  <div className="alert alert-info small mt-3 mb-0" role="status">
                    {copyMessage}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
