import { useCallback, useEffect, useMemo } from 'react';
import { API_BASE } from '../utils/api';

export default function useAttributeControls(context) {
  const {
    attributeData,
    attributeMeta,
    attributeSearch,
    setAttributeSearch,
    hiddenColumns,
    setHiddenColumns,
    attributeSortKey,
    setAttributeSortKey,
    attributeSortDir,
    setAttributeSortDir,
    setAttributeMenuOpen,
    setAttributeMenuColumn,
    query,
    setQuery,
    setQueryDistinctValues,
    setQueryDistinctLoading,
    layersConfig,
    layersRef,
    fetchAttributes,
  } = context;

  const renderValue = useCallback((value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return 'Geometry';
    return String(value);
  }, []);

  const visibleAttributeColumns = useMemo(
    () => attributeData?.columns?.filter((column) => !hiddenColumns.includes(column)) || [],
    [attributeData, hiddenColumns]
  );

  const sortedAttributeRows = useMemo(() => {
    if (!attributeData?.rows?.length) return [];

    const rowsWithMeta = attributeData.rows.map((row, idx) => ({
      row,
      idx,
      feature: attributeMeta?.rowFeatures?.[idx],
    }));

    const searchQuery = attributeSearch.trim().toLowerCase();
    const filteredRows = searchQuery
      ? rowsWithMeta.filter(({ row }) =>
        visibleAttributeColumns.some((column) => {
          const value = row?.[column];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchQuery);
        })
      )
      : rowsWithMeta;

    if (!attributeSortKey) return filteredRows;

    const dir = attributeSortDir === 'desc' ? -1 : 1;
    return [...filteredRows].sort((a, b) => {
      const av = a.row?.[attributeSortKey];
      const bv = b.row?.[attributeSortKey];
      const an = Number(av);
      const bn = Number(bv);
      const aNum = Number.isFinite(an);
      const bNum = Number.isFinite(bn);
      if (aNum && bNum) return (an - bn) * dir;
      const as = av === null || av === undefined ? '' : String(av);
      const bs = bv === null || bv === undefined ? '' : String(bv);
      return as.localeCompare(bs) * dir;
    });
  }, [attributeData, attributeMeta, attributeSearch, visibleAttributeColumns, attributeSortKey, attributeSortDir]);

  const toggleAttributeSort = useCallback((key) => {
    if (attributeSortKey !== key) {
      setAttributeSortKey(key);
      setAttributeSortDir('asc');
      return;
    }
    if (attributeSortDir === 'asc') {
      setAttributeSortDir('desc');
      return;
    }
    setAttributeSortKey('');
    setAttributeSortDir('asc');
  }, [attributeSortDir, attributeSortKey, setAttributeSortDir, setAttributeSortKey]);

  const toggleColumnVisibility = useCallback((key) => {
    setHiddenColumns((prev) => (
      prev.includes(key) ? prev.filter((column) => column !== key) : [...prev, key]
    ));
  }, [setHiddenColumns]);

  const openAttributeMenu = useCallback((column) => {
    setAttributeMenuOpen(true);
    setAttributeMenuColumn(column);
  }, [setAttributeMenuColumn, setAttributeMenuOpen]);

  const buildCQL = useCallback(() => {
    if (!query.field || !query.value) return null;
    const isNumber = !Number.isNaN(Number(query.value));
    const escapedValue = String(query.value).replace(/'/g, "''");
    if (query.operator === 'ILIKE') {
      return `${query.field} ILIKE '%${escapedValue}%'`;
    }
    return `${query.field} ${query.operator} ${isNumber ? query.value : `'${escapedValue}'`}`;
  }, [query]);

  const applyQuery = useCallback(() => {
    const active = layersConfig.find((layer) => layer.visible);
    if (!active) return;

    const cql = buildCQL();
    if (!cql) return;

    const activeLayer = layersRef.current[active.id];
    activeLayer?.getSource?.()?.updateParams?.({ CQL_FILTER: cql });
    fetchAttributes(active.apiLayer, cql, active.title);
  }, [buildCQL, fetchAttributes, layersConfig, layersRef]);

  const resetQuery = useCallback(() => {
    const active = layersConfig.find((layer) => layer.visible);
    if (!active) return;

    setQuery({ field: '', operator: '=', value: '' });
    const activeLayer = layersRef.current[active.id];
    activeLayer?.getSource?.()?.updateParams?.({ CQL_FILTER: 'INCLUDE' });
    fetchAttributes(active.apiLayer, null, active.title);
  }, [fetchAttributes, layersConfig, layersRef, setQuery]);

  useEffect(() => {
    const active = layersConfig.find((layer) => layer.visible);
    if (!query.field || !active?.apiLayer) {
      setQueryDistinctValues([]);
      setQueryDistinctLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timerId = setTimeout(async () => {
      setQueryDistinctLoading(true);
      try {
        const params = new URLSearchParams({
          layer: active.apiLayer,
          field: query.field,
          limit: '100',
        });
        if (query.value.trim()) {
          params.set('q', query.value.trim());
        }
        const res = await fetch(
          `${API_BASE}/api/attributes/distinct/?${params.toString()}`,
          { signal: controller.signal }
        );
        const json = await res.json();
        if (!controller.signal.aborted) {
          setQueryDistinctValues(Array.isArray(json.values) ? json.values : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setQueryDistinctValues([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setQueryDistinctLoading(false);
        }
      }
    }, 220);

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [layersConfig, query, setQueryDistinctLoading, setQueryDistinctValues]);

  useEffect(() => {
    const onClick = () => setAttributeMenuOpen(false);
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [setAttributeMenuOpen]);

  return {
    renderValue,
    visibleAttributeColumns,
    sortedAttributeRows,
    toggleAttributeSort,
    toggleColumnVisibility,
    openAttributeMenu,
    applyQuery,
    resetQuery,
    setAttributeSearch,
  };
}
