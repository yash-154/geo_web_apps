import React from 'react';
import './AnalysisTab.css';

const AnalysisTab = ({
  analysisTool,
  setAnalysisTool,
  setBufferMode,
  clearHeatmap,
  clearSpatialQuery,
  clearOsmDataTool,
  bufferTargetLayer,
  clearBufferSelectionFilter,
  setBufferTargetLayer,
  setBufferError,
  setBufferResultCount,
  bufferLayerRef,
  focusSelectedBufferLayer,
  bufferTargetOptions,
  spatialQueryLayerOptions,
  bufferInputMode,
  setBufferInputMode,
  bufferDistance,
  setBufferDistance,
  startBufferMode,
  clearBuffer,
  bufferMode,
  bufferLoading,
  bufferError,
  bufferResultCount,
  heatmapTargetLayer,
  setHeatmapTargetLayer,
  setHeatmapError,
  heatmapError,
  setHeatmapPointCount,
  setHeatmapFields,
  setHeatmapWeightField,
  heatmapFields,
  heatmapWeightField,
  heatmapRadius,
  handleHeatmapRadiusChange,
  heatmapBlur,
  handleHeatmapBlurChange,
  buildHeatmap,
  heatmapLoading,
  heatmapPointCount,
  spatialQueryReferenceLayer,
  setSpatialQueryReferenceLayer,
  setSpatialQueryError,
  spatialQueryTargetLayer,
  setSpatialQueryTargetLayer,
  spatialQueryOperator,
  setSpatialQueryOperator,
  SPATIAL_QUERY_OPERATORS,
  spatialQueryDistance,
  setSpatialQueryDistance,
  runSpatialQuery,
  spatialQueryLoading,
  spatialQueryError,
  spatialQueryResultCount,
  osmAoiInputMode,
  setOsmAoiInputMode,
  startOsmAoiMode,
  requestOsmAvailability,
  osmAoiMode,
  osmAoiBbox4326,
  osmAvailabilityLoading,
  osmAvailableDatasets,
  osmSelectedDatasets,
  setOsmSelectedDatasets,
  importSelectedOsmData,
  osmImportLoading,
  osmDataError,
}) => {
  return (
    <div className="raster-box">
      <div className="raster-section">
        <div className="raster-row">
          <label>Tool</label>
          <select
            value={analysisTool}
            onChange={(e) => {
              const nextTool = e.target.value;
              setAnalysisTool(nextTool);
              if (nextTool !== 'buffer') {
                setBufferMode(false);
              }
              if (nextTool !== 'heatmap') {
                clearHeatmap();
              }
              if (nextTool !== 'spatial_query') {
                clearSpatialQuery();
              }
              if (nextTool !== 'osm_import') {
                clearOsmDataTool();
              }
            }}
          >
            <option value="buffer">Buffer</option>
            <option value="heatmap">Heatmap View</option>
            <option value="spatial_query">Spatial Query</option>
            <option value="osm_import">OSM Import</option>
          </select>
        </div>
      </div>

      {analysisTool === 'buffer' && (
        <div className="raster-section">
          <div className="raster-section-title">Buffer Tool</div>

          <div className="raster-row">
            <label>Layer to fetch geometries</label>
            <select
              value={bufferTargetLayer}
              onChange={(e) => {
                const next = e.target.value;
                clearBufferSelectionFilter();
                setBufferTargetLayer(next);
                setBufferError('');
                setBufferMode(false);
                setBufferResultCount(0);
                bufferLayerRef.current?.getSource()?.clear();
                focusSelectedBufferLayer(next);
              }}
            >
              <option value="">Select layer</option>
              {bufferTargetOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="raster-row">
            <label>Input mode</label>
            <select
              value={bufferInputMode}
              onChange={(e) => {
                setBufferInputMode(e.target.value);
                setBufferMode(false);
                setBufferError('');
              }}
            >
              <option value="center_click">Center click</option>
              <option value="polygon">Draw polygon (center from geometry)</option>
              <option value="rectangle">Draw rectangle (center from geometry)</option>
            </select>
          </div>
          <div className="raster-row">
            <label>Distance (meters)</label>
            <input
              type="number"
              min="1"
              value={bufferDistance}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setBufferDistance('');
                  return;
                }
                const next = parseInt(raw, 10);
                setBufferDistance(Number.isFinite(next) ? Math.max(1, next) : '');
              }}
            />
          </div>
          <div className="raster-row raster-row-inline">
            <button
              className="analysis-btn"
              onClick={() => startBufferMode()}
              disabled={!bufferTargetLayer}
            >
              {bufferInputMode === 'polygon'
                ? (bufferMode ? 'Draw polygon...' : 'Start polygon')
                : bufferInputMode === 'rectangle'
                  ? (bufferMode ? 'Draw rectangle...' : 'Start rectangle')
                  : (bufferMode ? 'Click on map...' : 'Pick center')}
            </button>
            <button className="analysis-btn secondary" onClick={clearBuffer}>
              Clear
            </button>
          </div>
          <div className="routing-help">
            {bufferInputMode === 'center_click'
              ? 'Select layer, then click point on map. Buffer is created from that point.'
              : 'Select layer, draw geometry, and true buffer polygon will be created around it.'}
          </div>
          <div className="routing-help">
            Result output shows only geometries from selected layer that intersect buffer.
          </div>
          {bufferLoading && <div className="routing-help">Loading layer geometries…</div>}
          {bufferError && <div className="routing-error">{bufferError}</div>}
          {!bufferLoading && !bufferError && bufferResultCount > 0 && (
            <div className="routing-help">Matched geometries: {bufferResultCount}</div>
          )}
        </div>
      )}

      {analysisTool === 'heatmap' && (
        <div className="raster-section">
          <div className="raster-section-title">Heatmap View</div>
          <div className="raster-row">
            <label>Layer</label>
            <select
              value={heatmapTargetLayer}
              onChange={(e) => {
                setHeatmapTargetLayer(e.target.value);
                setHeatmapError('');
                setHeatmapPointCount(0);
                setHeatmapFields([]);
                setHeatmapWeightField('');
                clearHeatmap();
              }}
            >
              <option value="">Select layer</option>
              {bufferTargetOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="raster-row">
            <label>Weight field (optional)</label>
            <select
              value={heatmapWeightField}
              onChange={(e) => setHeatmapWeightField(e.target.value)}
            >
              <option value="">Uniform weight</option>
              {heatmapFields.map((field) => (
                <option key={field} value={field}>
                  {field}
                </option>
              ))}
            </select>
          </div>
          <div className="raster-row">
            <label>Radius</label>
            <input
              type="range"
              min="4"
              max="36"
              step="1"
              value={heatmapRadius}
              onChange={handleHeatmapRadiusChange}
            />
          </div>
          <div className="raster-row">
            <label>Blur</label>
            <input
              type="range"
              min="8"
              max="48"
              step="1"
              value={heatmapBlur}
              onChange={handleHeatmapBlurChange}
            />
          </div>
          <div className="raster-row raster-row-inline">
            <button
              className="analysis-btn"
              onClick={buildHeatmap}
              disabled={!heatmapTargetLayer || heatmapLoading}
            >
              {heatmapLoading ? 'Building...' : 'Generate Heatmap'}
            </button>
            <button className="analysis-btn secondary" onClick={clearHeatmap}>
              Clear
            </button>
          </div>
          <div className="routing-help">
            Heatmap uses feature centers from selected layer.
          </div>
          {heatmapError && <div className="routing-error">{heatmapError}</div>}
          {!heatmapLoading && !heatmapError && heatmapPointCount > 0 && (
            <div className="routing-help">Heatmap points: {heatmapPointCount}</div>
          )}
        </div>
      )}

      {analysisTool === 'spatial_query' && (
        <div className="raster-section">
          <div className="raster-section-title">Spatial Query</div>
          <div className="routing-help">
            Select reference layer, target layer, and operator to query attributes spatially.
          </div>
          <div className="raster-row">
            <label>Reference layer</label>
            <select
              value={spatialQueryReferenceLayer}
              onChange={(e) => {
                setSpatialQueryReferenceLayer(e.target.value);
                setSpatialQueryError('');
              }}
            >
              <option value="">Select reference layer</option>
              {spatialQueryLayerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="raster-row">
            <label>Target layer (query layer)</label>
            <select
              value={spatialQueryTargetLayer}
              onChange={(e) => {
                setSpatialQueryTargetLayer(e.target.value);
                setSpatialQueryError('');
              }}
            >
              <option value="">Select target layer</option>
              {spatialQueryLayerOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="raster-row">
            <label>Operator</label>
            <select
              value={spatialQueryOperator}
              onChange={(e) => setSpatialQueryOperator(e.target.value)}
            >
              {SPATIAL_QUERY_OPERATORS.map((operator) => (
                <option key={operator.value} value={operator.value}>
                  {operator.label}
                </option>
              ))}
            </select>
          </div>
          {['within', 'not_within', 'closest_within', 'connected'].includes(spatialQueryOperator) && (
            <div className="raster-row">
              <label>Distance / tolerance (meters)</label>
              <input
                type="number"
                value={spatialQueryDistance}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === '') {
                    setSpatialQueryDistance('');
                    return;
                  }
                  const next = parseInt(raw, 10);
                  setSpatialQueryDistance(Number.isFinite(next) ? Math.max(1, next) : '');
                }}
              />
            </div>
          )}
          <div className="raster-row raster-row-inline">
            <button
              className="analysis-btn"
              onClick={runSpatialQuery}
              disabled={!spatialQueryReferenceLayer || !spatialQueryTargetLayer || spatialQueryLoading}
            >
              {spatialQueryLoading ? 'Running...' : 'Run Query'}
            </button>
            <button className="analysis-btn secondary" onClick={clearSpatialQuery}>
              Clear
            </button>
          </div>
          <div className="routing-help">
            Operators supported: touching/contained, inside, not inside, within, not within, closest within, connected, and overlap filters.
          </div>
          {spatialQueryError && <div className="routing-error">{spatialQueryError}</div>}
          {!spatialQueryLoading && !spatialQueryError && spatialQueryResultCount > 0 && (
            <div className="routing-help">Matched records: {spatialQueryResultCount}</div>
          )}
        </div>
      )}

      {analysisTool === 'osm_import' && (
        <div className="raster-section">
          <div className="raster-section-title">OSM Import</div>
          <div className="raster-row">
            <label>AOI shape</label>
            <select
              value={osmAoiInputMode}
              onChange={(e) => setOsmAoiInputMode(e.target.value)}
            >
              <option value="polygon">Polygon</option>
              <option value="rectangle">Rectangle</option>
            </select>
          </div>
          <div className="raster-row raster-row-inline">
            <button className="analysis-btn" onClick={startOsmAoiMode}>
              {osmAoiMode ? 'Drawing...' : 'Draw Area'}
            </button>
            <button
              className="analysis-btn secondary"
              onClick={requestOsmAvailability}
              disabled={!osmAoiBbox4326 || osmAvailabilityLoading}
            >
              {osmAvailabilityLoading ? 'Checking...' : 'Check Available Data'}
            </button>
          </div>
          <div className="routing-help">
            Draw area, request available datasets, then import selected data as a new layer.
          </div>
          {osmAoiBbox4326 && (
            <div className="routing-help">
              AOI ready: {osmAoiBbox4326.map((v) => Number(v).toFixed(4)).join(', ')}
            </div>
          )}
          {osmAvailableDatasets.length > 0 && (
            <div className="raster-row">
              <label>Available datasets</label>
              <div className="attribute-menu-panel">
                {osmAvailableDatasets.map((item) => (
                  <label key={item.key} className="attribute-menu-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(osmSelectedDatasets[item.key])}
                      onChange={(e) =>
                        setOsmSelectedDatasets((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }
                    />
                    {item.key} ({item.count})
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="raster-row raster-row-inline">
            <button
              className="analysis-btn"
              onClick={importSelectedOsmData}
              disabled={!osmAvailableDatasets.length || osmImportLoading}
            >
              {osmImportLoading ? 'Importing...' : 'Add Selected Data As Layer'}
            </button>
            <button className="analysis-btn secondary" onClick={clearOsmDataTool}>
              Clear
            </button>
          </div>
          {osmDataError && <div className="routing-error">{osmDataError}</div>}
        </div>
      )}
    </div>
  );
};

export default AnalysisTab;
