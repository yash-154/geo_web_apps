import React from 'react';
import './RasterTab.css';

const RasterTab = ({
  rasterTheme,
  setRasterTheme,
  uploadedDataset,
  handleUploadedDatasetChange,
  RASTER_DATASET_OPTIONS,
  uploadedDateTime,
  setUploadedDateTime,
  handleRasterImport,
  uploadedRasters,
  uploadedLeft,
  setUploadedLeft,
  uploadedCompareEnabled,
  setUploadedCompareEnabled,
  uploadedRight,
  setUploadedRight,
  uploadedSwipeEnabled,
  setUploadedSwipeEnabled,
  importedRasterVisible,
  setImportedRasterVisible,
  clearImportedRaster,
  demRasters,
  profileDem,
  setProfileDem,
  startProfileMode,
  clearProfile,
  profileMode,
  profilePoints,
  profileOpen,
  profileLoading,
  profileError,
  profileData,
  profileDemLabel,
  profileHover,
  setProfileHover,
  rasterEnabled,
  rasterStartYear,
  setRasterEnabled,
  setRasterCompareEnabled,
  LULC_YEARS,
  rasterCompareEnabled,
  rasterEndYear,
  setRasterStartYear,
  setRasterEndYear,
  rasterAnalysisOpen,
  setRasterAnalysisOpen,
  rasterMode,
  setRasterMode,
  LULC_LEGEND,
}) => {
  const profileValues = profileData.filter((point) => Number.isFinite(point.value));
  const profileMin = profileValues.length ? Math.min(...profileValues.map((point) => point.value)) : 0;
  const profileMax = profileValues.length ? Math.max(...profileValues.map((point) => point.value)) : 0;
  const profileDistance = profileData.length ? profileData[profileData.length - 1].distance : 0;

  const profileChart = (() => {
    const width = 640;
    const height = 160;
    const padding = 20;
    if (!profileValues.length) return null;

    const range = profileMax - profileMin || 1;
    const points = profileData.map((point, index) => {
      const x = padding + (index / Math.max(1, profileData.length - 1)) * (width - padding * 2);
      const y =
        height -
        padding -
        ((point.value ?? profileMin) - profileMin) / range * (height - padding * 2);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });

    const handleMove = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
      const t = rect.width === 0 ? 0 : x / rect.width;
      const index = Math.max(0, Math.min(profileData.length - 1, Math.round(t * (profileData.length - 1))));
      const point = profileData[index];
      setProfileHover(point ? { ...point, index } : null);
    };

    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="profile-chart"
        onMouseMove={handleMove}
        onMouseLeave={() => setProfileHover(null)}
      >
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#2563eb"
          strokeWidth="2"
        />
        {profileHover && (
          <circle
            cx={padding + (profileHover.index / Math.max(1, profileData.length - 1)) * (width - padding * 2)}
            cy={
              height -
              padding -
              ((profileHover.value ?? profileMin) - profileMin) / range * (height - padding * 2)
            }
            r="3"
            fill="#ef4444"
          />
        )}
        <line
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="#e5e7eb"
        />
        <line
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="#e5e7eb"
        />
      </svg>
    );
  })();

  return (
    <>
      <div className="raster-box">
        <div className="raster-row">
        <label>Dataset</label>
        <select
          value={rasterTheme}
          onChange={(e) => setRasterTheme(e.target.value)}
        >
          <option value="LULC">LULC</option>
          <option value="UPLOAD">Uploaded</option>
        </select>
        </div>

        {rasterTheme === 'UPLOAD' && (
        <>
          <div className="raster-section">
            <div className="raster-section-title">Upload</div>
            <div className="raster-row">
              <label>Dataset type</label>
              <select
                value={uploadedDataset}
                onChange={handleUploadedDatasetChange}
              >
                {RASTER_DATASET_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>

            <div className="raster-row">
              <label>Date & Time</label>
              <input
                type="datetime-local"
                value={uploadedDateTime}
                onChange={(e) => setUploadedDateTime(e.target.value)}
              />
            </div>

            <div className="raster-row">
              <label>Upload raster</label>
              <input
                type="file"
                accept=".tif,.tiff,.geotiff"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  handleRasterImport(file);
                }}
              />
              <div className="raster-help">
                Stored as `{uploadedDataset}_YYYY-MM-DDThh-mm.tif`
              </div>
            </div>
          </div>

          <div className="raster-section">
            <div className="raster-section-title">Select & Compare</div>
            {uploadedRasters.length > 0 && (
              <div className="raster-row">
                <label>Left raster</label>
                <select
                  value={uploadedLeft}
                  onChange={(e) => setUploadedLeft(e.target.value)}
                >
                  <option value="">Select</option>
                  {uploadedRasters.map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.display || item.datetime || item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {uploadedRasters.length > 1 && (
              <label className="raster-toggle">
                <input
                  type="checkbox"
                  checked={uploadedCompareEnabled}
                  onChange={(e) => setUploadedCompareEnabled(e.target.checked)}
                  disabled={!uploadedLeft}
                />
                Compare rasters
              </label>
            )}

            {uploadedCompareEnabled && uploadedRasters.length > 1 && (
              <div className="raster-row">
                <label>Right raster</label>
                <select
                  value={uploadedRight}
                  onChange={(e) => setUploadedRight(e.target.value)}
                >
                  <option value="">Select</option>
                  {uploadedRasters
                    .filter((item) => item.name !== uploadedLeft)
                    .map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.display || item.datetime || item.name}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {uploadedCompareEnabled && uploadedRasters.length > 1 && (
              <label className="raster-toggle">
                <input
                  type="checkbox"
                  checked={uploadedSwipeEnabled}
                  onChange={(e) => setUploadedSwipeEnabled(e.target.checked)}
                  disabled={!uploadedRight}
                />
                Swipe mode
              </label>
            )}
          </div>

          <div className="raster-section">
            <div className="raster-section-title">View</div>
            {uploadedLeft && (
              <div className="raster-row raster-row-inline">
                <label>
                  <input
                    type="checkbox"
                    checked={importedRasterVisible}
                    onChange={(e) => setImportedRasterVisible(e.target.checked)}
                  />{' '}
                  Show uploaded raster
                </label>
                <button className="analysis-btn" onClick={clearImportedRaster}>
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="raster-section">
            <div className="raster-section-title">Elevation Profile (DEM)</div>
            {demRasters.length === 0 && (
              <div className="raster-help">No DEM rasters uploaded yet.</div>
            )}
            {demRasters.length > 0 && (
              <>
                <div className="raster-row">
                  <label>DEM for profile</label>
                  <select
                    value={profileDem}
                    onChange={(e) => setProfileDem(e.target.value)}
                  >
                    <option value="">Select</option>
                    {demRasters.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.display || item.datetime || item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="raster-row raster-row-inline">
                  <button
                    className="analysis-btn"
                    onClick={startProfileMode}
                    disabled={!profileDem}
                  >
                    {profileMode ? 'Pick 2 points...' : 'Pick 2 points'}
                  </button>
                  <button className="analysis-btn secondary" onClick={clearProfile}>
                    Clear
                  </button>
                </div>
                {profilePoints.length > 0 && (
                  <div className="raster-help">
                    Points selected: {profilePoints.length}/2
                  </div>
                )}
              </>
            )}
          </div>
        </>
        )}

        {rasterTheme === 'LULC' && (
        <>
          <div className="raster-row">
            <label>Year</label>
            <select
              value={rasterEnabled ? rasterStartYear : ''}
              onChange={(e) => {
                const value = parseInt(e.target.value);
                if (Number.isNaN(value)) {
                  setRasterEnabled(false);
                  setRasterCompareEnabled(false);
                  return;
                }
                setRasterEnabled(true);
                setRasterStartYear(value);
              }}
            >
              <option value="">Select year</option>
              {LULC_YEARS.map((y) => (
                <option key={y.layer} value={y.year}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>

          <label className="raster-toggle">
            <input
              type="checkbox"
              checked={rasterCompareEnabled}
              onChange={(e) => setRasterCompareEnabled(e.target.checked)}
              disabled={!rasterEnabled}
            />
            Compare layers
          </label>

          {rasterCompareEnabled && (
            <div className="raster-row">
              <label>Compare years</label>
              <div className="raster-slider-values">
                <span>Left: {LULC_YEARS.find((y) => y.year === rasterStartYear)?.label}</span>
                <span>Right: {LULC_YEARS.find((y) => y.year === rasterEndYear)?.label}</span>
              </div>
              <div className="raster-compare-selects">
                <select
                  value={rasterStartYear}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setRasterStartYear(value);
                    if (value > rasterEndYear) setRasterEndYear(value);
                  }}
                  disabled={!rasterEnabled}
                >
                  {LULC_YEARS.map((y) => (
                    <option key={y.layer} value={y.year}>
                      {y.label}
                    </option>
                  ))}
                </select>
                <select
                  value={rasterEndYear}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    setRasterEndYear(value);
                    if (value < rasterStartYear) setRasterStartYear(value);
                  }}
                  disabled={!rasterEnabled}
                >
                  {LULC_YEARS.map((y) => (
                    <option key={y.layer} value={y.year}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="raster-row">
            <button
              className="analysis-btn"
              onClick={() => setRasterAnalysisOpen((prev) => !prev)}
              disabled={!rasterEnabled}
            >
              {rasterAnalysisOpen ? 'Hide Analysis' : 'Analysis'}
            </button>
          </div>

          {rasterAnalysisOpen && (
            <div className="raster-analysis">
              <div className="analysis-row">
                <button
                  className={`analysis-toggle ${rasterMode === 'step' ? 'active' : ''}`}
                  onClick={() => {
                    setRasterCompareEnabled(false);
                    setRasterMode('step');
                  }}
                >
                  Step Mode
                </button>
                <button
                  className={`analysis-toggle ${rasterMode === 'swipe' ? 'active' : ''}`}
                  onClick={() => {
                    setRasterMode('swipe');
                    setRasterCompareEnabled(true);
                  }}
                >
                  Swipe Mode
                </button>
              </div>

              <div className="analysis-section-title">Legend</div>
              <div className="legend-grid">
                {LULC_LEGEND.map((item) => (
                  <div key={item.label} className="legend-item">
                    <span className="legend-swatch" style={{ background: item.color }} />
                    <span className="legend-label">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
        )}
      </div>

      {profileOpen && (
        <div className="profile-drawer">
          <div className="profile-header">
            <div>
              Elevation Profile
              {profileDemLabel && <span className="profile-subtitle"> — {profileDemLabel}</span>}
            </div>
            <button className="profile-close" onClick={clearProfile}>
              Close
            </button>
          </div>
          <div className="profile-body">
            {profileLoading && <div className="profile-status">Building profile…</div>}
            {!profileLoading && profileError && (
              <div className="profile-error">{profileError}</div>
            )}
            {!profileLoading && !profileError && !profileData.length && (
              <div className="profile-status">Pick two points on the map.</div>
            )}
            {!profileLoading && !profileError && profileData.length > 0 && (
              <>
                <div className="profile-metrics">
                  <div>Min: {profileMin.toFixed(2)} m</div>
                  <div>Max: {profileMax.toFixed(2)} m</div>
                  <div>Distance: {(profileDistance / 1000).toFixed(2)} km</div>
                </div>
                {profileHover && (
                  <div className="profile-hover">
                    {profileHover.value !== null
                      ? `Elevation: ${profileHover.value.toFixed(2)} m`
                      : 'Elevation: N/A'}{' '}
                    • {(profileHover.distance / 1000).toFixed(2)} km
                  </div>
                )}
                {profileChart}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default RasterTab;
