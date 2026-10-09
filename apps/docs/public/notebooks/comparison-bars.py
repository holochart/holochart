# %% [markdown]
# # Compare categorical values
# Read horizontal axes, stacking, signed contributions and visible labels.
# All data is included below: no repository helper imports, files or network requests.
# These literal figures reproduce the initial public JavaScript examples. Seeded browser
# arrays are frozen here, typed arrays become lists, and NaN becomes None (the same missing
# observation). Source and helper hashes plus semantic figure identity are checked before generation.
# Install only holochart-py into the selected notebook kernel, then restart and run all cells.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% [markdown]
# ## Bar: horizontal, log axis
# Horizontal bars spanning four decades on a log x axis, colored by value through a colorscale.
# Matching browser example: bar/horizontal. Its included values are deterministic source data.

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

# %% [markdown]
# ## Bar: stacked, date axis
# Three traces stacked per month on a date axis, with rounded stack ends and segment outlines.
# Matching browser example: bar/stacked. Its included values are deterministic source data.

# %% Figure bar/stacked
figure_bar_stacked = {'data': [{'type': 'bar',
           'name': 'Hardware',
           'x': ['2024-01-01',
                 '2024-02-01',
                 '2024-03-01',
                 '2024-04-01',
                 '2024-05-01',
                 '2024-06-01'],
           'y': [14, 16, 13, 18, 21, 19],
           'marker': {'line': {'width': 1, 'color': '#0a0a0f'}}},
          {'type': 'bar',
           'name': 'Software',
           'x': ['2024-01-01',
                 '2024-02-01',
                 '2024-03-01',
                 '2024-04-01',
                 '2024-05-01',
                 '2024-06-01'],
           'y': [9, 11, 14, 12, 15, 18],
           'marker': {'line': {'width': 1, 'color': '#0a0a0f'}}},
          {'type': 'bar',
           'name': 'Services',
           'x': ['2024-01-01',
                 '2024-02-01',
                 '2024-03-01',
                 '2024-04-01',
                 '2024-05-01',
                 '2024-06-01'],
           'y': [5, 4, 7, 9, 8, 11],
           'marker': {'line': {'width': 1, 'color': '#0a0a0f'}}}],
 'layout': {'xaxis': {'dtick': 'M1'}, 'barmode': 'stack', 'barcornerradius': 6},
 'config': {'responsive': True}}

# %% Display bar/stacked
if "chart_bar_stacked" in globals():
    chart_bar_stacked.close()
chart_bar_stacked = HolochartWidget(figure_bar_stacked, height=450)
assert chart_bar_stacked.figure == figure_bar_stacked
display(chart_bar_stacked)

# %% [markdown]
# ## Bar: relative
# Positive values stack above zero and negative values below it, per position.
# Matching browser example: bar/relative. Its included values are deterministic source data.

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

# %% [markdown]
# ## Bar: text labels
# texttemplate, textposition auto/outside/inside, insidetextanchor and contrast colors on vertical and horizontal bars.
# Matching browser example: bar/text. Its included values are deterministic source data.

# %% Figure bar/text
figure_bar_text = {'data': [{'type': 'bar',
           'name': 'Revenue',
           'x': ['North', 'South', 'East', 'West', 'Central'],
           'y': [42.5, 3.2, 27.8, 35.1, 1.4],
           'texttemplate': '$%{value:.1f}M',
           'textposition': 'auto'},
          {'type': 'bar',
           'name': 'Growth',
           'x': ['North', 'South', 'East', 'West', 'Central'],
           'y': [12, -4, 8, 15, -2],
           'texttemplate': '%{value:+d}%',
           'textposition': 'outside'},
          {'type': 'bar',
           'name': 'Share',
           'orientation': 'h',
           'y': ['A', 'B', 'C'],
           'x': [48, 31, 21],
           'text': ['Alpha', 'Beta', 'Gamma'],
           'textposition': 'inside',
           'insidetextanchor': 'middle',
           'xaxis': 'x2',
           'yaxis': 'y2',
           'marker': {'color': ['#9962c0', '#f2c14e', '#128b8b']}}],
 'layout': {'xaxis': {'domain': [0, 0.62]},
            'xaxis2': {'domain': [0.7, 1], 'anchor': 'y2'},
            'yaxis2': {'anchor': 'x2'}},
 'config': {'responsive': True}}

# %% Display bar/text
if "chart_bar_text" in globals():
    chart_bar_text.close()
chart_bar_text = HolochartWidget(figure_bar_text, height=440)
assert chart_bar_text.figure == figure_bar_text
display(chart_bar_text)
