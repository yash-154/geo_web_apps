import { useCallback } from 'react';
import { fromUrl as geotiffFromUrl } from 'geotiff';
import { transform } from 'ol/proj';
import { loadRasterList } from '../utils/styleUtils';

export default function useRasterControls(context) {
  const {
    rasterApiBase,
    uploadedDataset,
    uploadedDateTime,
    setUploadedDataset,
    setUploadedLeft,
    setUploadedRight,
    setUploadedCompareEnabled,
    setUploadedSwipeEnabled,
    setUploadedRasters,
    setImportedRasterVisible,
    rasterImportLayerRef,
    rasterImportCompareLayerRef,
    rasterImportUrlRef,
    setDemRasters,
    setProfileDem,
    setProfileMode,
    setProfilePoints,
    setProfileData,
    setProfileLoading,
    setProfileError,
    setProfileOpen,
    setProfileHover,
    profileLineLayerRef,
    setHeatmapRadius,
    heatmapLayerRef,
    setHeatmapBlur,
    updateRasterLayerState,
    rasterEnabled,
    rasterCompareEnabled,
    rasterLayerRef,
    rasterCompareLayerRef,
  } = context;

  const fetchUploadedRasters = useCallback(async (dataset) => {
    try {
      const items = await loadRasterList(rasterApiBase, dataset);
      setUploadedRasters(items);
      if (items.length) {
        setUploadedLeft((prev) => prev || items[0].name);
      }
    } catch (error) {
      console.error('Failed to load uploaded rasters:', error);
      setUploadedRasters([]);
    }
  }, [rasterApiBase, setUploadedLeft, setUploadedRasters]);

  const fetchDemRasters = useCallback(async () => {
    try {
      const items = await loadRasterList(rasterApiBase, 'DEM');
      setDemRasters(items);
      if (items.length) {
        setProfileDem((prev) => prev || items[0].name);
      }
    } catch (error) {
      console.error('Failed to load DEM rasters:', error);
      setDemRasters([]);
    }
  }, [rasterApiBase, setDemRasters, setProfileDem]);

  const buildElevationProfile = useCallback(async (startCoord, endCoord, demItem) => {
    if (!demItem?.url) return;
    setProfileLoading(true);
    setProfileError('');
    setProfileData([]);

    try {
      const tiff = await geotiffFromUrl(demItem.url);
      const image = await tiff.getImage();
      const bbox = image.getBoundingBox();
      if (!bbox) {
        throw new Error('DEM has no bounding box.');
      }

      const [minX, minY, maxX, maxY] = bbox;
      const width = image.getWidth();
      const height = image.getHeight();

      const start4326 = transform(startCoord, 'EPSG:3857', 'EPSG:4326');
      const end4326 = transform(endCoord, 'EPSG:3857', 'EPSG:4326');

      const toPixel = (coord) => {
        const x = ((coord[0] - minX) / (maxX - minX)) * width;
        const y = ((maxY - coord[1]) / (maxY - minY)) * height;
        return [x, y];
      };

      const [px0, py0] = toPixel(start4326);
      const [px1, py1] = toPixel(end4326);

      const winMinX = Math.max(0, Math.floor(Math.min(px0, px1)));
      const winMaxX = Math.min(width, Math.ceil(Math.max(px0, px1)));
      const winMinY = Math.max(0, Math.floor(Math.min(py0, py1)));
      const winMaxY = Math.min(height, Math.ceil(Math.max(py0, py1)));

      if (winMaxX - winMinX < 2 || winMaxY - winMinY < 2) {
        throw new Error('Profile line is too small.');
      }

      const sampleCount = 160;
      const raster = await image.readRasters({
        samples: [0],
        window: [winMinX, winMinY, winMaxX, winMaxY],
        width: sampleCount,
        height: sampleCount,
        interleave: true,
      });

      const totalDistance = Math.hypot(endCoord[0] - startCoord[0], endCoord[1] - startCoord[1]);
      const data = [];

      for (let i = 0; i < sampleCount; i += 1) {
        const t = sampleCount === 1 ? 0 : i / (sampleCount - 1);
        const x = px0 + (px1 - px0) * t;
        const y = py0 + (py1 - py0) * t;
        const rx = Math.max(0, Math.min(sampleCount - 1, Math.round(((x - winMinX) / (winMaxX - winMinX)) * (sampleCount - 1))));
        const ry = Math.max(0, Math.min(sampleCount - 1, Math.round(((y - winMinY) / (winMaxY - winMinY)) * (sampleCount - 1))));
        const value = raster[ry * sampleCount + rx];
        data.push({
          distance: totalDistance * t,
          value: Number.isFinite(value) ? value : null,
        });
      }

      setProfileData(data);
      setProfileOpen(true);
    } catch (error) {
      console.error('Elevation profile failed:', error);
      setProfileError(error.message || 'Failed to build elevation profile.');
    } finally {
      setProfileLoading(false);
    }
  }, [setProfileData, setProfileError, setProfileLoading, setProfileOpen]);

  const handleHeatmapRadiusChange = useCallback((event) => {
    const next = parseInt(event.target.value, 10) || 16;
    setHeatmapRadius(next);
    heatmapLayerRef.current?.setRadius(Math.max(1, Number(next) || 1));
  }, [heatmapLayerRef, setHeatmapRadius]);

  const handleHeatmapBlurChange = useCallback((event) => {
    const next = parseInt(event.target.value, 10) || 24;
    setHeatmapBlur(next);
    heatmapLayerRef.current?.setBlur(Math.max(1, Number(next) || 1));
  }, [heatmapLayerRef, setHeatmapBlur]);

  const handleUploadedDatasetChange = useCallback((event) => {
    setUploadedDataset(event.target.value);
    setUploadedLeft('');
    setUploadedRight('');
    setUploadedCompareEnabled(false);
    setUploadedSwipeEnabled(false);
  }, [
    setUploadedCompareEnabled,
    setUploadedDataset,
    setUploadedLeft,
    setUploadedRight,
    setUploadedSwipeEnabled,
  ]);

  const clearImportedRaster = useCallback(() => {
    if (rasterImportLayerRef.current) {
      rasterImportLayerRef.current.setSource(null);
      rasterImportLayerRef.current.setVisible(false);
    }
    if (rasterImportCompareLayerRef.current) {
      rasterImportCompareLayerRef.current.setSource(null);
      rasterImportCompareLayerRef.current.setVisible(false);
    }
    if (rasterImportUrlRef.current) {
      URL.revokeObjectURL(rasterImportUrlRef.current);
      rasterImportUrlRef.current = null;
    }
    setImportedRasterVisible(false);
    setUploadedLeft('');
    setUploadedRight('');
    setUploadedCompareEnabled(false);
    setUploadedSwipeEnabled(false);
  }, [
    rasterImportCompareLayerRef,
    rasterImportLayerRef,
    rasterImportUrlRef,
    setImportedRasterVisible,
    setUploadedCompareEnabled,
    setUploadedLeft,
    setUploadedRight,
    setUploadedSwipeEnabled,
  ]);

  const handleRasterImport = useCallback(async (file) => {
    if (!file) return;
    if (!uploadedDateTime) {
      alert('Please select a date/time before uploading.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('dataset', uploadedDataset);
    formData.append('datetime', uploadedDateTime);

    try {
      const res = await fetch(`${rasterApiBase}/upload/`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Raster upload failed.');
        return;
      }
      setImportedRasterVisible(true);
      setUploadedLeft(json.name);
      setUploadedCompareEnabled(false);
      setUploadedSwipeEnabled(false);
      setUploadedRight('');
      await fetchUploadedRasters(uploadedDataset);
    } catch (error) {
      console.error('Raster upload failed:', error);
      alert('Raster upload failed.');
    }
  }, [
    fetchUploadedRasters,
    rasterApiBase,
    setImportedRasterVisible,
    setUploadedCompareEnabled,
    setUploadedLeft,
    setUploadedRight,
    setUploadedSwipeEnabled,
    uploadedDataset,
    uploadedDateTime,
  ]);

  const startProfileMode = useCallback(() => {
    setProfileMode(true);
    setProfilePoints([]);
    setProfileData([]);
    setProfileError('');
    setProfileOpen(true);
    profileLineLayerRef.current?.getSource().clear();
    setProfileHover(null);
  }, [
    profileLineLayerRef,
    setProfileData,
    setProfileError,
    setProfileHover,
    setProfileMode,
    setProfileOpen,
    setProfilePoints,
  ]);

  const clearProfile = useCallback(() => {
    setProfileMode(false);
    setProfilePoints([]);
    setProfileData([]);
    setProfileError('');
    setProfileOpen(false);
    profileLineLayerRef.current?.getSource().clear();
    setProfileHover(null);
  }, [
    profileLineLayerRef,
    setProfileData,
    setProfileError,
    setProfileHover,
    setProfileMode,
    setProfileOpen,
    setProfilePoints,
  ]);

  const updateRasterLayer = useCallback((layerName) => {
    const layer = rasterLayerRef.current;
    if (!layer) return;
    layer.setVisible(rasterEnabled);
    layer.getSource().updateParams({ LAYERS: layerName });
    updateRasterLayerState?.();
  }, [rasterEnabled, rasterLayerRef, updateRasterLayerState]);

  const updateRasterCompareLayer = useCallback((layerName) => {
    const layer = rasterCompareLayerRef.current;
    if (!layer) return;
    layer.setVisible(rasterEnabled && rasterCompareEnabled);
    layer.getSource().updateParams({ LAYERS: layerName });
    updateRasterLayerState?.();
  }, [rasterCompareEnabled, rasterCompareLayerRef, rasterEnabled, updateRasterLayerState]);

  return {
    fetchUploadedRasters,
    fetchDemRasters,
    buildElevationProfile,
    handleHeatmapRadiusChange,
    handleHeatmapBlurChange,
    handleUploadedDatasetChange,
    clearImportedRaster,
    handleRasterImport,
    startProfileMode,
    clearProfile,
    updateRasterLayer,
    updateRasterCompareLayer,
  };
}
