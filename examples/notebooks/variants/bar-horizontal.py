# %% [markdown]
# # bar/horizontal: Python counterpart
# Generated from examples/notebooks/comparison-bars.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure bar/horizontal
figure_bar_horizontal = {'data': [{'type': 'bar',
           'orientation': 'h',
           'y': ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'],
           'x': [3, 12, 45, 180, 720, 2900],
           'marker': {'color': [0.47712125471966244,
                                1.0791812460476249,
                                1.6532125137753437,
                                2.255272505103306,
                                2.8573324964312685,
                                3.462397997898956],
                      'colorscale': 'Viridis'}}],
 'layout': {'xaxis': {'type': 'log', 'dtick': 'D2'}, 'bargap': 0.3},
 'config': {'responsive': True}}

# %% Display bar/horizontal
if "chart_bar_horizontal" in globals():
    chart_bar_horizontal.close()
chart_bar_horizontal = HolochartWidget(figure_bar_horizontal, height=450)
assert chart_bar_horizontal.figure == figure_bar_horizontal
display(chart_bar_horizontal)
