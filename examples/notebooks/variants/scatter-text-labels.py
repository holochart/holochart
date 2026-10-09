# %% [markdown]
# # scatter/text-labels: Python counterpart
# Generated from examples/notebooks/themes-labels.py; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure scatter/text-labels
figure_scatter_text_labels = {'data': [{'name': 'textposition',
           'x': [0, 2, 4, 0, 2, 4, 0, 2, 4],
           'y': [4, 4, 4, 2.5, 2.5, 2.5, 1, 1, 1],
           'mode': 'markers+text',
           'text': ['top left',
                    'top center',
                    'top right',
                    'middle left',
                    'middle center',
                    'middle right',
                    'bottom left',
                    'bottom center',
                    'bottom right'],
           'textposition': ['top left',
                            'top center',
                            'top right',
                            'middle left',
                            'middle center',
                            'middle right',
                            'bottom left',
                            'bottom center',
                            'bottom right'],
           'marker': {'size': 12, 'color': '#5e74d5'}},
          {'name': 'texttemplate',
           'x': [7, 8, 9, 10],
           'y': [0.2, 1.4, 0.9, 2.3],
           'mode': 'lines+markers+text',
           'textposition': 'top center',
           'texttemplate': '%{y:.2f} €',
           'customdata': ['2026-03-02T00:00:00.000Z',
                          '2026-03-09T00:00:00.000Z',
                          '2026-03-16T00:00:00.000Z',
                          '2026-03-23T00:00:00.000Z'],
           'marker': {'size': 7, 'color': '#ea2a37'},
           'line': {'color': '#ea2a37'},
           'textfont': {'size': [9, 11, 13, 15],
                        'color': ['#ea2a37', '#9962c0', '#118e36', '#128b8b']}},
          {'name': 'dates',
           'x': [7, 8.5, 10],
           'y': [4.2, 3.4, 4.4],
           'mode': 'markers+text',
           'textposition': 'bottom center',
           'texttemplate': '%{customdata|%b %d}',
           'customdata': ['2026-03-02T00:00:00.000Z',
                          '2026-04-01T00:00:00.000Z',
                          '2026-05-01T00:00:00.000Z'],
           'marker': {'size': 9, 'symbol': 'diamond', 'color': '#118e36'},
           'textfont': {'weight': 'bold', 'size': 10, 'color': '#eceef4'}},
          {'name': 'text only',
           'x': [2, 4.5],
           'y': [-1, -0.6],
           'mode': 'text',
           'text': ['text-only<br>two lines', 'plain'],
           'textfont': {'size': 11, 'color': '#80838f'}}],
 'layout': {'showlegend': False, 'xaxis': {'range': [-1.4, 11]}}}

# %% Display scatter/text-labels
if "chart_scatter_text_labels" in globals():
    chart_scatter_text_labels.close()
chart_scatter_text_labels = HolochartWidget(figure_scatter_text_labels, height=440)
assert chart_scatter_text_labels.figure == figure_scatter_text_labels
display(chart_scatter_text_labels)
