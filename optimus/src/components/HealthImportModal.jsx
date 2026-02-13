import { useState } from 'react';
import { parseAppleHealthJSON } from '../utils/healthDataParser';
import './HealthImportModal.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function HealthImportModal({ onClose, onImportComplete }) {
  const [importData, setImportData] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const parsed = parseAppleHealthJSON(event.target.result);
        setImportData(parsed);
        setImportError('');
        setImportSuccess(`Ready to import ${parsed.length} health records`);
      } catch (error) {
        setImportError(error.message);
        setImportData(null);
      }
    };

    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!importData) return;

    setIsImporting(true);
    setImportError('');

    try {
      const response = await fetch(`${API_URL}/health/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ healthData: importData }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result?.error || 'Import failed');
      }

      setImportSuccess(`Successfully imported ${result.imported} records!`);
      setTimeout(() => {
        onImportComplete();
      }, 1500);
    } catch (error) {
      setImportError(error.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="health-import-modal-overlay" onClick={onClose}>
      <div className="health-import-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import Apple Health Data</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="import-instructions">
            <h3>How to export from Apple Health:</h3>
            <ol>
              <li>Open the Health app on your iPhone</li>
              <li>Tap your profile picture → Export All Health Data</li>
              <li>Wait for the export to complete</li>
              <li>Upload the exported JSON file below</li>
            </ol>
          </div>

          <div className="file-upload-area">
            <input
              type="file"
              accept=".json,.xml"
              onChange={handleFileUpload}
              id="health-file-input"
              disabled={isImporting}
            />
            <label htmlFor="health-file-input" className="file-upload-label">
              📁 Choose JSON File
            </label>
          </div>

          {importSuccess && !importError && (
            <div className="import-success">{importSuccess}</div>
          )}

          {importError && (
            <div className="import-error">{importError}</div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose} disabled={isImporting}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleImport}
            disabled={!importData || isImporting}
          >
            {isImporting ? 'Importing...' : `Import ${importData?.length || 0} Records`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HealthImportModal;
