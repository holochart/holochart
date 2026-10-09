# %% [markdown]
# # scatter/error-bars: Python counterpart
# Generated from examples/notebooks/data-troubleshooting.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

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
