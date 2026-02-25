from django.db import models

class SharedStyleConfig(models.Model):
    key = models.CharField(max_length=64, unique=True, default='default')
    named_styles = models.JSONField(default=list, blank=True)
    layer_styles = models.JSONField(default=dict, blank=True)
    layer_style_selections = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SharedStyleConfig({self.key})"
