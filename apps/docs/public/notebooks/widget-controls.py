# %% [markdown]
# # A Python-driven control
# Install the base holochart-py package and ipywidgets. This example does not require Plotly.
# Move Multiplier: Python observes the slider and assigns a replacement figure to the existing widget.

# %% Imports
import ipywidgets as widgets
from IPython.display import display, clear_output
from holochart import HolochartWidget

# %% Create or replace the controlled output
if "slider" in globals():
    slider.unobserve(on_multiplier, names="value")
    slider.close()
if "control_chart" in globals():
    control_chart.close()
if "controls_panel" in globals():
    controls_panel.close()
clear_output(wait=True)
base_counts = [3, 5, 2]
control_chart = HolochartWidget({"data": [{"type": "bar", "x": ["A", "B", "C"], "y": base_counts}],
                                "layout": {"title": {"text": "Controlled counts"}}}, height=340)
slider = widgets.IntSlider(value=1, min=1, max=4, step=1, description="Multiplier", continuous_update=False)

def on_multiplier(change):
    control_chart.figure = {
        "data": [{"type": "bar", "x": ["A", "B", "C"], "y": [n * change["new"] for n in base_counts]}],
        "layout": {"title": {"text": "Controlled counts"}},
    }

slider.observe(on_multiplier, names="value")
controls_panel = widgets.VBox([slider, control_chart])
display(controls_panel)

# %% Exercise the existing output
slider.value = 2
assert control_chart.figure["data"][0]["y"] == [6, 10, 4]

# %% [markdown]
# The test cell moves Multiplier to 2; the bars become 6, 10 and 4 in the same chart output.
# Rerunning the creation cell removes the previous Python callback, closes its widgets and clears its output.
# This is a Python-to-browser update, not a callback from Holochart interactions.
