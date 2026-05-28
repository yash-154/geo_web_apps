import React from 'react';
import './QueryTab.css';

const QueryTab = ({
  query,
  setQuery,
  attributeData,
  queryDistinctValues,
  queryDistinctLoading,
  applyQuery,
  resetQuery,
}) => {
  return (
    <div className="query-box">
      <select
        value={query.field}
        onChange={(e) =>
          setQuery({ ...query, field: e.target.value, value: '' })
        }
      >
        <option value="">Field</option>
        {attributeData?.columns.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>

      <select
        value={query.operator}
        onChange={(e) =>
          setQuery({ ...query, operator: e.target.value })
        }
      >
        <option value="=">=</option>
        <option value=">">&gt;</option>
        <option value="<">&lt;</option>
        <option value="ILIKE">LIKE</option>
      </select>

      <input
        value={query.value}
        onChange={(e) =>
          setQuery({ ...query, value: e.target.value })
        }
        list="query-distinct-values"
        placeholder="Value"
      />
      <datalist id="query-distinct-values">
        {queryDistinctValues.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      {query.field && (
        <small className="query-suggestion-hint">
          {queryDistinctLoading
            ? 'Loading values...'
            : queryDistinctValues.length
              ? `${queryDistinctValues.length} matching values`
              : 'No matching values'}
        </small>
      )}
      {query.field && queryDistinctValues.length > 0 && (
        <select
          className="query-value-list"
          size={Math.min(6, queryDistinctValues.length)}
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            setQuery({ ...query, value: e.target.value });
          }}
        >
          <option value="" disabled>
            Select value
          </option>
          {queryDistinctValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      )}

      <button onClick={applyQuery}>Apply</button>
      <button onClick={resetQuery}>Reset</button>
    </div>
  );
};

export default QueryTab;