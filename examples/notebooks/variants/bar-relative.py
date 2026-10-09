# %% [markdown]
# # bar/relative: Python counterpart
# Generated from examples/notebooks/comparison-bars.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure bar/relative
figure_bar_relative = {'data': [{'type': 'bar',
           'name': 'Sales',
           'x': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
           'y': [12, 15, 9, 14, 18, 16, 20, 17]},
          {'type': 'bar',
           'name': 'Refunds',
           'x': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
           'y': [-3, -2, -6, -4, -3, -7, -5, -2]},
          {'type': 'bar',
           'name': 'Fees',
           'x': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
           'y': [-2, -2, 3, -3, -2, 4, -4, -3]},
          {'type': 'bar',
           'name': 'Grants',
           'x': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
           'y': [4, 0, 5, 2, 0, 6, 3, 5]}],
 'layout': {'barmode': 'relative', 'bargap': 0.3},
 'config': {'responsive': True}}

# %% Display bar/relative
if "chart_bar_relative" in globals():
    chart_bar_relative.close()
chart_bar_relative = HolochartWidget(figure_bar_relative, height=450)
assert chart_bar_relative.figure == figure_bar_relative
display(chart_bar_relative)
