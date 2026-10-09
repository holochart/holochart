# %% [markdown]
# # bar/basic: Python counterpart
# Generated from examples/notebooks/widgets.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure bar/basic
gallery_figure_bar_basic = {'data': [{'type': 'bar',
           'x': ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
           'y': [12, 18, 7, -5, 21, 15, 9],
           'marker': {'line': {'width': 1.5, 'color': '#ff9aa2'}, 'cornerradius': 4}}],
 'layout': {},
 'config': {'responsive': True}}

# %% Display bar/basic
if "gallery_chart_bar_basic" in globals():
    gallery_chart_bar_basic.close()
gallery_chart_bar_basic = HolochartWidget(gallery_figure_bar_basic, height=450)
assert gallery_chart_bar_basic.figure == gallery_figure_bar_basic
display(gallery_chart_bar_basic)
