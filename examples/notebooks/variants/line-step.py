# %% [markdown]
# # line/step: Python counterpart
# Generated from examples/notebooks/time-series-gaps.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure line/step
figure_line_step = {'data': [{'type': 'scatter',
           'mode': 'lines+markers',
           'name': "'hv': hold, then step",
           'x': ['2024-01-01',
                 '2024-03-15',
                 '2024-06-01',
                 '2024-07-20',
                 '2024-10-01',
                 '2025-01-15',
                 '2025-04-01',
                 '2025-06-30'],
           'y': [4.5, 4.5, 4.25, 4, 3.75, 3.75, 3.5, 3.25],
           'line': {'shape': 'hv', 'width': 2.5},
           'marker': {'size': 7}},
          {'type': 'scatter',
           'mode': 'lines+markers',
           'name': "'vh': step, then hold",
           'x': ['2024-01-01',
                 '2024-03-15',
                 '2024-06-01',
                 '2024-07-20',
                 '2024-10-01',
                 '2025-01-15',
                 '2025-04-01',
                 '2025-06-30'],
           'y': [6, 6, 5.75, 5.5, 5.25, 5.25, 5, 4.75],
           'line': {'shape': 'vh', 'width': 2.5},
           'marker': {'size': 7}},
          {'type': 'scatter',
           'mode': 'lines+markers',
           'name': "'hvh': step halfway",
           'x': ['2024-01-01',
                 '2024-03-15',
                 '2024-06-01',
                 '2024-07-20',
                 '2024-10-01',
                 '2025-01-15',
                 '2025-04-01',
                 '2025-06-30'],
           'y': [7.5, 7.5, 7.25, 7, 6.75, 6.75, 6.5, 6.25],
           'line': {'shape': 'hvh', 'width': 2.5},
           'marker': {'size': 7}}],
 'layout': {'yaxis': {'title': {'text': 'Rate (%), offset per series'}, 'ticksuffix': '%'}}}

# %% Display line/step
if "chart_line_step" in globals():
    chart_line_step.close()
chart_line_step = HolochartWidget(figure_line_step, height=450)
assert chart_line_step.figure == figure_line_step
display(chart_line_step)
