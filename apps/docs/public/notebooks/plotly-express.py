# %% [markdown]
# # Plotly Express with built-in data
# Install pandas and numpy into the notebook kernel in addition to holochart-py[plotly].
# The five examples use supported scatter, bar, line, histogram and heatmap traces.
# plotly.express is Python's Plotly API; it is separate from Holochart's TypeScript Express API.

# %% Imports and renderer
import numpy as np
import pandas as pd
import plotly.express as px
import holochart
holochart.register_renderer(default=True, height=360)

# %% DataFrame scatter
observations = pd.DataFrame({
    "hours": [1, 2, 3, 4, 5, 6],
    "score": [2, 3, 2, 5, 4, 6],
    "group": ["A", "A", "A", "B", "B", "B"],
})
scatter = px.scatter(observations, x="hours", y="score", color="group", title="Study observations")
scatter.show()

# %% Ordered categorical bars
counts = pd.DataFrame({"day": ["Wed", "Mon", "Tue"], "count": [7, 12, 18]})
bar = px.bar(counts, x="day", y="count", category_orders={"day": ["Mon", "Tue", "Wed"]}, title="Ordered days")
bar.show()

# %% Dates and a missing observation
series = pd.DataFrame({
    "date": pd.date_range("2026-01-01", periods=5),
    "value": [3.0, 4.0, np.nan, 2.0, 5.0],
})
line = px.line(series, x="date", y="value", markers=True, title="A visible missing-day gap")
line.update_traces(connectgaps=False)
line.show()

# %% NumPy histogram
response_times = np.array([42, 44, 44, 47, 48, 48, 50, 51, 54, 57, 60, 63], dtype=np.float64)
histogram = px.histogram(x=response_times, nbins=6, title="Response times")
histogram.update_layout(xaxis_title="Time (ms)", yaxis_title="Count")
histogram.show()

# %% Scalar heatmap
field = np.array([[1, 2, 4], [3, 5, 2], [2, 1, 6]], dtype=np.float64)
heatmap = px.imshow(field, x=["A", "B", "C"], y=["North", "Mid", "South"],
                    aspect="auto", color_continuous_scale="Viridis", title="Small scalar field")
heatmap.show()

# %% [markdown]
# Pandas is optional unless your own code uses DataFrames. NumPy is optional unless your data uses it.
# Dates and missing values use Plotly's JSON encoder; recent Plotly versions can encode NumPy arrays
# as dtype/bdata/shape objects, which the bundled browser bridge decodes.
# An accepted Plotly Figure is not a promise that every Plotly attribute or extension is supported.
