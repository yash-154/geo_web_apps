import React from 'react';
import fullscreenIcon from '../icons/fullscreenicon.png';
import './AttributesTab.css';

const AttributesTab = ({
  attributeData,
  activeAttributeLayer,
  fullscreen,
  setFullscreen,
  visibleAttributeColumns,
  toggleAttributeSort,
  openAttributeMenu,
  setAttributeMenuOpen,
  attributeSortKey,
  attributeSortDir,
  attributeMenuOpen,
  attributeMenuColumn,
  setAttributeSortKey,
  setAttributeSortDir,
  attributeSearch,
  setAttributeSearch,
  hiddenColumns,
  toggleColumnVisibility,
  sortedAttributeRows,
  zoomToFeature,
  highlightHoverFeature,
  clearHoverHighlight,
  renderValue,
}) => {
  const renderTable = (isFullscreen = false) => (
    <table className={`table table-sm table-bordered${isFullscreen ? ' attributes-fullscreen-table' : ''}`}>
      <thead>
        <tr>
          {visibleAttributeColumns.map((c) => (
            <th
              key={c}
              className="sortable-header"
              onClick={() => toggleAttributeSort(c)}
              onMouseEnter={() => openAttributeMenu(c)}
              onMouseLeave={() => setAttributeMenuOpen(false)}
              title="Sort"
            >
              <span className="header-title">{c}</span>
              <span className="header-actions">
                {attributeSortKey === c && (
                  <span className="sort-indicator">
                    {attributeSortDir === 'asc' ? '▲' : '▼'}
                  </span>
                )}
              </span>
              {attributeMenuOpen && attributeMenuColumn === c && (
                <div
                  className="attribute-menu"
                  onClick={(e) => e.stopPropagation()}
                  onMouseEnter={() => openAttributeMenu(c)}
                  onMouseLeave={() => setAttributeMenuOpen(false)}
                >
                  <button
                    className="attribute-menu-item"
                    onClick={() => {
                      setAttributeSortKey(c);
                      setAttributeSortDir('asc');
                      setAttributeMenuOpen(false);
                    }}
                  >
                    ↑ Sort Ascending
                  </button>
                  <button
                    className="attribute-menu-item"
                    onClick={() => {
                      setAttributeSortKey(c);
                      setAttributeSortDir('desc');
                      setAttributeMenuOpen(false);
                    }}
                  >
                    ↓ Sort Descending
                  </button>
                  <div className="attribute-menu-label">Filter</div>
                  <div className="attribute-menu-panel">
                    <input
                      className="attribute-menu-input"
                      type="text"
                      placeholder="Search..."
                      value={attributeSearch}
                      onChange={(e) => setAttributeSearch(e.target.value)}
                    />
                    {attributeSearch && (
                      <button
                        className="attribute-menu-clear"
                        onClick={() => setAttributeSearch('')}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="attribute-menu-label">Columns</div>
                  <div className="attribute-menu-panel">
                    {attributeData.columns.map((col) => (
                      <label key={col} className="attribute-menu-checkbox">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.includes(col)}
                          onChange={() => toggleColumnVisibility(col)}
                        />
                        {col}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedAttributeRows.map((item, i) => (
          <tr
            key={i}
            className={item.feature ? 'attribute-row attribute-row-interactive' : 'attribute-row'}
            onClick={item.feature ? () => zoomToFeature(item.feature) : undefined}
            onMouseEnter={item.feature ? () => highlightHoverFeature(item.feature) : undefined}
            onMouseLeave={item.feature ? () => clearHoverHighlight() : undefined}
          >
            {visibleAttributeColumns.map((c) => (
              <td key={c}>{renderValue(item.row[c])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <>
      {attributeData ? (
        <>
          <div className="attribute-layer-title">
            {activeAttributeLayer ? `Layer: ${activeAttributeLayer}` : 'Layer: —'}
          </div>
          {attributeData.message ? (
            <div className="no-data-msg">
              {attributeData.message}
            </div>
          ) : (
            <>
              <button
                className="fullscreen-icon-btn"
                onClick={() => setFullscreen(true)}
              >
                <img src={fullscreenIcon} alt="fullscreen" />
              </button>

              <div className="attribute-table-wrapper">
                {renderTable()}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="no-data-msg">Select a layer to view attributes.</div>
      )}

      {fullscreen && attributeData && (
        <div className="attributes-fullscreen">
          <div className="attributes-header">
            <span>
              Attribute Table
              {activeAttributeLayer ? ` — ${activeAttributeLayer}` : ''}
            </span>
            <button onClick={() => setFullscreen(false)}>✕</button>
          </div>

          <div className="attributes-body">
            {renderTable(true)}
          </div>
        </div>
      )}
    </>
  );
};

export default AttributesTab;
