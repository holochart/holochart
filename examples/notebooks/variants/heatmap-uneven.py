# %% [markdown]
# # heatmap/uneven: Python counterpart
# Generated from examples/notebooks/data-troubleshooting.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure heatmap/uneven
figure_heatmap_uneven = {'data': [{'type': 'heatmap',
           'x': [0, 1, 1.5, 2, 3, 5, 8, 13, 21],
           'y': [0, 0.5, 1, 2, 4, 8],
           'z': [[None,
                  0.479425538604203,
                  0.8414709848078965,
                  0.9974949866040544,
                  0.9092974268256817,
                  None,
                  0.1411200080598672,
                  -0.35078322768961984],
                 [0.3333333333333333,
                  None,
                  1.1748043181412298,
                  1.3308283199373878,
                  1.242630760159015,
                  0.9318054774372897,
                  None,
                  -0.01744989435628652],
                 [0.6666666666666666,
                  1.1460922052708695,
                  None,
                  1.664161653270721,
                  1.5759640934923485,
                  1.265138810770623,
                  0.8077866747265339,
                  None],
                 [1,
                  1.479425538604203,
                  1.8414709848078965,
                  None,
                  1.9092974268256817,
                  1.5984721441039564,
                  1.1411200080598671,
                  0.6492167723103801],
                 [1.3333333333333333,
                  1.8127588719375363,
                  2.1748043181412298,
                  2.3308283199373876,
                  None,
                  1.9318054774372897,
                  1.4744533413932004,
                  0.9825501056437134]],
           'connectgaps': True,
           'colorscale': 'Viridis'}],
 'layout': {'title': {'text': 'Fibonacci columns, doubling rows'}}}

# %% Display heatmap/uneven
if "chart_heatmap_uneven" in globals():
    chart_heatmap_uneven.close()
chart_heatmap_uneven = HolochartWidget(figure_heatmap_uneven, height=450)
assert chart_heatmap_uneven.figure == figure_heatmap_uneven
display(chart_heatmap_uneven)
