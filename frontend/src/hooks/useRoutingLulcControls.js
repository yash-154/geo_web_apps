import { useCallback } from 'react';
import GeoJSON from 'ol/format/GeoJSON';
import WKT from 'ol/format/WKT';
import Draw from 'ol/interaction/Draw';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import { transform } from 'ol/proj';

export default function useRoutingLulcControls(context) {
  const {
    geoserverProxyBase,
    routingToken,
    routingLayerRef,
    setRoutingPoints,
    setRoutingError,
    setRoutingLoading,
    setLulcAoiWkt,
    setLulcStatsData,
    setLulcStatsError,
    setLulcStatsLoading,
    setLulcAoiMode,
    aoiLayerRef,
    mapRef,
    aoiDrawRef,
    lulcToken,
    setLulcStatsOpen,
  } = context;

  const clearRouting = useCallback(() => {
    routingLayerRef.current?.getSource().clear();
    setRoutingPoints([]);
    setRoutingError('');
    setRoutingLoading(false);
  }, [routingLayerRef, setRoutingError, setRoutingLoading, setRoutingPoints]);

  const buildRoutingPath = useCallback(async (startCoord, endCoord) => {
    if (!routingToken) {
      setRoutingError('Token is required.');
      return;
    }
    setRoutingLoading(true);
    setRoutingError('');
    clearRouting();

    const start4326 = transform(startCoord, 'EPSG:3857', 'EPSG:4326');
    const end4326 = transform(endCoord, 'EPSG:3857', 'EPSG:4326');

    const params = new URLSearchParams({
      lat1: String(start4326[1]),
      lon1: String(start4326[0]),
      lat2: String(end4326[1]),
      lon2: String(end4326[0]),
    });
    params.append('token', routingToken);

    try {
      const res = await fetch(`${geoserverProxyBase.replace('/geoserver', '')}/bhuvan/routing/?${params.toString()}`);
      const json = await res.json();
      const featureCollection = Array.isArray(json) ? json[0] : json;
      if (!featureCollection || !featureCollection.features) {
        throw new Error('Invalid routing response.');
      }
      const features = new GeoJSON().readFeatures(featureCollection, {
        featureProjection: 'EPSG:3857',
        dataProjection: 'EPSG:4326',
      });
      const source = routingLayerRef.current?.getSource();
      if (!source) return;
      source.clear();

      features.forEach((feature) => {
        const geomType = feature.getGeometry()?.getType();
        if (geomType === 'MultiLineString' || geomType === 'LineString') {
          feature.set('kind', 'route');
          source.addFeature(feature);
        } else if (geomType === 'Point') {
          source.addFeature(feature);
        }
      });

      const startFeature = new Feature(new Point(startCoord));
      startFeature.set('kind', 'start');
      const endFeature = new Feature(new Point(endCoord));
      endFeature.set('kind', 'end');
      source.addFeature(startFeature);
      source.addFeature(endFeature);
    } catch (error) {
      console.error('Routing failed:', error);
      setRoutingError(error.message || 'Routing failed.');
    } finally {
      setRoutingLoading(false);
    }
  }, [clearRouting, geoserverProxyBase, routingLayerRef, routingToken, setRoutingError, setRoutingLoading]);

  const clearLulcAoi = useCallback(() => {
    aoiLayerRef.current?.getSource().clear();
    setLulcAoiWkt('');
    setLulcStatsData(null);
    setLulcStatsError('');
    setLulcStatsLoading(false);
    setLulcAoiMode(false);
  }, [
    aoiLayerRef,
    setLulcAoiMode,
    setLulcAoiWkt,
    setLulcStatsData,
    setLulcStatsError,
    setLulcStatsLoading,
  ]);

  const fetchLulcStats = useCallback(async (wkt) => {
    if (!wkt) return;
    setLulcStatsLoading(true);
    setLulcStatsError('');
    setLulcStatsData(null);

    try {
      const params = new URLSearchParams({
        geom: wkt,
        token: lulcToken,
      });
      const res = await fetch(`${geoserverProxyBase.replace('/geoserver', '')}/bhuvan/lulc-aoi/?${params.toString()}`);
      const data = await res.json();
      setLulcStatsData(data);
    } catch (error) {
      console.error('LULC stats failed:', error);
      setLulcStatsError(error.message || 'Failed to fetch LULC stats.');
    } finally {
      setLulcStatsLoading(false);
    }
  }, [geoserverProxyBase, lulcToken, setLulcStatsData, setLulcStatsError, setLulcStatsLoading]);

  const startLulcAoiDraw = useCallback(() => {
    if (!mapRef.current || !aoiLayerRef.current) return;
    if (!lulcToken) {
      setLulcStatsError('Token is required.');
      setLulcStatsOpen(true);
      return;
    }
    setLulcAoiMode(true);
    setLulcStatsError('');
    aoiLayerRef.current.getSource().clear();

    if (aoiDrawRef.current) {
      mapRef.current.removeInteraction(aoiDrawRef.current);
    }

    const draw = new Draw({
      source: aoiLayerRef.current.getSource(),
      type: 'Polygon',
    });

    draw.on('drawstart', () => {
      aoiLayerRef.current.getSource().clear();
    });

    draw.on('drawend', (event) => {
      mapRef.current.removeInteraction(draw);
      aoiDrawRef.current = null;
      setLulcAoiMode(false);
      const geom = event.feature.getGeometry();
      if (!geom) return;
      const geom4326 = geom.clone().transform('EPSG:3857', 'EPSG:4326');
      const wkt = new WKT().writeGeometry(geom4326);
      setLulcAoiWkt(wkt);
      fetchLulcStats(wkt);
      setLulcStatsOpen(true);
    });

    aoiDrawRef.current = draw;
    mapRef.current.addInteraction(draw);
  }, [
    aoiDrawRef,
    aoiLayerRef,
    fetchLulcStats,
    lulcToken,
    mapRef,
    setLulcAoiMode,
    setLulcAoiWkt,
    setLulcStatsError,
    setLulcStatsOpen,
  ]);

  return {
    clearRouting,
    buildRoutingPath,
    clearLulcAoi,
    fetchLulcStats,
    startLulcAoiDraw,
  };
}
