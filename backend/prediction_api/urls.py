from django.urls import path, re_path
from .views import (
    layer_attributes,
    layer_distinct_values,
    style_config,
    analysis_buffer,
    bhuvan_wms_proxy,
    bhuvan_lulc_stats,
    bhuvan_lulc_aoi,
    geoserver_proxy,
    upload_raster,
    list_rasters,
    bhuvan_routing,
    osm_query,
)

urlpatterns = [
    path('attributes/', layer_attributes),
    path('attributes/distinct/', layer_distinct_values),
    path('styles/config/', style_config),
    path('analysis/buffer/', analysis_buffer),
    path('bhuvan/lulc-stats/', bhuvan_lulc_stats),
    path('bhuvan/lulc-aoi/', bhuvan_lulc_aoi),
    path('bhuvan/routing/', bhuvan_routing),
    path('osm/query/', osm_query),
    path('raster/upload/', upload_raster),
    path('raster/list/', list_rasters),
    re_path(r'^bhuvan/wms/?$', bhuvan_wms_proxy),  # Handles with or without trailing slash
    re_path(r'^geoserver/(?P<path>.*)$', geoserver_proxy),  # Proxy for GeoServer WMS/WFS
]
