import React from 'react';
import './ThreeDTab.css';

const ThreeDTab = ({
  threeD_layers,
  active3DLayers,
  setActive3DLayers,
  threeDAnalysisTool,
  setThreeDAnalysisTool,
  setThreeDAnalysisStartToken,
  setThreeDAnalysisClearToken,
  threeDStylingAttribute,
  setThreeDStylingAttribute,
  threeDObserverHeight,
  setThreeDObserverHeight,
  threeDViewshedRange,
  setThreeDViewshedRange,
  threeDImportFiles,
  setThreeDImportFiles,
  inspectThreeDAttributes,
  threeDImportName,
  setThreeDImportName,
  threeDImportFields,
  threeDImportHeightColumn,
  setThreeDImportHeightColumn,
  threeDImportDiameterColumn,
  setThreeDImportDiameterColumn,
  threeDInspectLoading,
  threeDImportCrs,
  setThreeDImportCrs,
  threeDImportLoading,
  threeDImportError,
  importThreeDTiles,
  undergroundMode,
  setUndergroundMode,
  flyToLayer,
  delete3DLayer,
}) => {
  const updateNumberText = (setter) => (event) => {
    setter(event.target.value);
  };

  return (
    <div className="three-d-panel">
      <div className="raster-section">
        <div className="raster-section-title">3D Layers</div>
        {threeD_layers.map((layer) => (
          <div key={layer.id} className="three-d-layer-row">
            <label className="three-d-toggle">
              <input
                type="checkbox"
                checked={active3DLayers.includes(layer.id)}
                onChange={(event) => {
                  setActive3DLayers((prev) =>
                    event.target.checked
                      ? [...prev, layer.id]
                      : prev.filter((item) => item !== layer.id)
                  );
                }}
              />
              {layer.name || layer.id}
            </label>
            <button
              type="button"
              className="three-d-zoom-btn"
              title={`Zoom to ${layer.name || layer.id}`}
              onClick={() => flyToLayer(layer.id)}
            >
              ⊕
            </button>
            {layer.id.startsWith('mago_') && (
              <button
                type="button"
                className="three-d-delete-btn"
                title={`Delete ${layer.name || layer.id}`}
                onClick={() => delete3DLayer(layer.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <div className="three-d-underground-row">
          <label className="three-d-toggle">
            <input
              type="checkbox"
              checked={undergroundMode}
              onChange={(event) => setUndergroundMode(event.target.checked)}
            />
            Underground
          </label>
        </div>
      </div>

      <div className="raster-section">
        <div className="raster-section-title">3D Tile Import (Shapefile)</div>
        <div className="raster-row">
          <label>Shapefile</label>
          <input
            type="file"
            accept=".shp,.shx,.dbf,.prj,.cpg,.qpj,.zip"
            multiple
            onChange={(event) => inspectThreeDAttributes(Array.from(event.target.files || []))}
          />
        </div>
        <div className="three-d-file-list">
          {(threeDImportFiles || []).map((file) => (
            <span key={`${file.name}-${file.size}`}>{file.name}</span>
          ))}
        </div>
        <div className="raster-row">
          <label>Layer name</label>
          <input
            type="text"
            value={threeDImportName}
            onChange={(event) => setThreeDImportName(event.target.value)}
            placeholder="Imported buildings"
          />
        </div>
        <div className="three-d-analysis-grid">
          <label className="three-d-number-field">
            <span>Height column</span>
            <select
              value={threeDImportHeightColumn}
              onChange={(event) => setThreeDImportHeightColumn(event.target.value)}
              disabled={threeDInspectLoading}
            >
              <option value="">None</option>
              {(threeDImportFields || []).map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </label>
          <label className="three-d-number-field">
            <span>EPSG</span>
            <input
              type="number"
              value={threeDImportCrs}
              onChange={(event) => setThreeDImportCrs(event.target.value)}
              placeholder="4326"
            />
          </label>
        </div>
        <div className="three-d-analysis-grid">
          <label className="three-d-number-field">
            <span>Diameter column</span>
            <select
              value={threeDImportDiameterColumn}
              onChange={(event) => setThreeDImportDiameterColumn(event.target.value)}
              disabled={threeDInspectLoading}
            >
              <option value="">None</option>
              {(threeDImportFields || []).map((field) => (
                <option key={field} value={field}>{field}</option>
              ))}
            </select>
          </label>
        </div>
        {threeDInspectLoading && <div className="three-d-status">Reading shapefile attributes...</div>}
        <button
          className="analysis-btn"
          onClick={importThreeDTiles}
          disabled={threeDImportLoading || threeDInspectLoading}
        >
          {threeDImportLoading ? 'Creating 3D Tiles...' : 'Import SHP as 3D Tiles'}
        </button>
        {threeDImportError && <div className="three-d-error">{threeDImportError}</div>}
      </div>

      <div className="raster-section">
        <div className="raster-section-title">Cesium 3D Analysis</div>
        <div className="raster-row">
          <label>Tool</label>
          <select
            value={threeDAnalysisTool}
            onChange={(event) => setThreeDAnalysisTool(event.target.value)}
          >
            <option value="line-of-sight">Line of Sight</option>
            <option value="slice">Slice</option>
            <option value="viewshed">Viewshed</option>
          </select>
        </div>
        <div className="three-d-analysis-grid">
          <label className="three-d-number-field">
            <span>Observer height (m)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={threeDObserverHeight}
              onChange={updateNumberText(setThreeDObserverHeight)}
              placeholder="e.g. 1.7"
            />
          </label>
          <label className="three-d-number-field">
            <span>Viewshed range (m)</span>
            <input
              type="number"
              min="25"
              max="1000"
              step="5"
              value={threeDViewshedRange}
              onChange={updateNumberText(setThreeDViewshedRange)}
              placeholder="e.g. 220"
            />
          </label>
        </div>
        <div className="raster-row raster-row-inline">
          <button
            className="analysis-btn"
            onClick={() => setThreeDAnalysisStartToken((value) => value + 1)}
          >
            Start Analysis
          </button>
          <button
            className="analysis-btn secondary"
            onClick={() => setThreeDAnalysisClearToken((value) => value + 1)}
          >
            Clear
          </button>
        </div>
        <div className="routing-help">
          Buildings stay visible here as long as the 3D layer is turned on above.
        </div>
        <div className="routing-help">
          Click Start, then place the selected analysis directly in the Cesium scene. Viewshed is an approximate ray sample, not a full terrain-certified visibility model.
        </div>
      </div>

      <div className="raster-section">
        <div className="raster-section-title">3D Building Styling</div>
        <div className="raster-row">
          <label>Attribute</label>
          <select
            value={threeDStylingAttribute}
            onChange={(event) => setThreeDStylingAttribute(event.target.value)}
          >
            <option value="default">Default (White)</option>
            <option value="height">Height</option>
            <option value="building_type">Building Type</option>
            <option value="age">Age</option>
          </select>
        </div>
        <div className="routing-help">
          Select an attribute to color-code the 3D buildings based on their properties.
        </div>
      </div>
    </div>
  );
};

export default ThreeDTab;
