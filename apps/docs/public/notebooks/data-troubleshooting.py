# %% [markdown]
# # Data shape and missing cells
# Check irregular heatmap edges, missing cells, and scatter error arrays.
# All data is included below: no repository helper imports, files or network requests.
# These literal figures reproduce the initial public JavaScript examples. Seeded browser
# arrays are frozen here, typed arrays become lists, and NaN becomes None (the same missing
# observation). Source and helper hashes plus semantic figure identity are checked before generation.
# Install only holochart-py into the selected notebook kernel, then restart and run all cells.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% [markdown]
# ## Heatmap: uneven cells and gaps
# Cells of varying width and height from edge arrays, with gaps filled.
# Matching browser example: heatmap/uneven. Its included values are deterministic source data.

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

# %% Check heatmap dimensions
trace = figure_heatmap_uneven["data"][0]
assert len(trace["x"]) == len(trace["z"][0]) + 1
assert len(trace["y"]) == len(trace["z"]) + 1
assert any(value is None for row in trace["z"] for value in row)

# %% [markdown]
# ## Scatter: error bars
# error_y data (symmetric and asymmetric), percent and sqrt; error_x constant with copy_ystyle; custom thickness, width and color.
# Matching browser example: scatter/error-bars. Its included values are deterministic source data.

# %% Figure scatter/error-bars
figure_scatter_error_bars = {'data': [{'name': 'data ± array',
           'x': [1, 2, 3, 4, 5, 6],
           'y': [3.4510142471641303,
                 3.7088475255761297,
                 4.43441158994101,
                 4.941187890572474,
                 5.8519706330262125,
                 6.091893793223425],
           'mode': 'lines+markers',
           'error_y': {'type': 'data',
                       'array': [0.7570914687355981,
                                 0.5216055109165609,
                                 0.32879445697180926,
                                 0.6547479239059613,
                                 0.7158160609658808,
                                 0.4653976956149563]}},
          {'name': 'asymmetric',
           'x': [1.15, 2.15, 3.15, 4.15, 5.15, 6.15],
           'y': [6.45101424716413,
                 6.70884752557613,
                 7.43441158994101,
                 7.941187890572474,
                 8.851970633026212,
                 9.091893793223425],
           'mode': 'markers',
           'error_y': {'type': 'data',
                       'array': [0.7570914687355981,
                                 0.5216055109165609,
                                 0.32879445697180926,
                                 0.6547479239059613,
                                 0.7158160609658808,
                                 0.4653976956149563],
                       'arrayminus': [0.20245589488185944,
                                      0.3870023741386831,
                                      0.22190086445771157,
                                      0.1637976765166968,
                                      0.17887005824595692,
                                      0.3139982498716563],
                       'color': '#cc540a',
                       'thickness': 1.5}},
          {'name': 'percent + x constant',
           'x': [1, 2, 3, 4, 5, 6],
           'y': [0.4510142471641303,
                 0.7088475255761297,
                 1.4344115899410097,
                 1.9411878905724738,
                 2.8519706330262125,
                 3.0918937932234254],
           'mode': 'markers',
           'marker': {'symbol': 'square', 'size': 7},
           'error_y': {'type': 'percent', 'value': 15, 'width': 8},
           'error_x': {'type': 'constant', 'value': 0.25}},
          {'name': 'sqrt',
           'x': [8, 9, 10, 11, 12, 13],
           'y': [0.6666666666666666,
                 1.5,
                 2.6666666666666665,
                 4.166666666666667,
                 6,
                 8.166666666666666],
           'mode': 'lines+markers',
           'line': {'dash': 'dot'},
           'error_y': {'type': 'sqrt',
                       'thickness': 3,
                       'width': 0,
                       'color': 'rgba(17, 142, 54, 0.5)'}}]}

# %% Display scatter/error-bars
if "chart_scatter_error_bars" in globals():
    chart_scatter_error_bars.close()
chart_scatter_error_bars = HolochartWidget(figure_scatter_error_bars, height=450)
assert chart_scatter_error_bars.figure == figure_scatter_error_bars
display(chart_scatter_error_bars)

# %% [markdown]
# ## Check the kernel and JSON-safe data
# These diagnostics describe this kernel, not the browser widget manager. If charts are missing,
# compare the printed interpreter/dependency versions with the selected environment first.
# Dict inputs accept JSON-safe lists and strings without Plotly. Convert dates explicitly here;
# the optional Plotly encoder is another supported path for NumPy/date inputs.
# The current bridge needs WebGL2 and an active widget manager, has no static export target or
# browser-to-Python event callbacks, and does not bundle geo/graph extensions.

# %% Kernel and serialization checks
import sys
import json
from array import array
from datetime import date
from importlib.metadata import version

print("Selected interpreter:", sys.executable)
for dependency in ["holochart-py", "anywidget", "ipywidgets"]:
    print(dependency, version(dependency))
values = array("d", [3, 1, 4]).tolist()
dates = [date(2026, 1, day).isoformat() for day in [1, 2, 3]]
json_safe = {"data": [{"type": "scatter", "x": dates, "y": values}]}
assert len(dates) == len(values)
assert json.loads(json.dumps(json_safe)) == json_safe
