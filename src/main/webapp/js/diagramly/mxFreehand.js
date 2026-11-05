/**
 * Copyright (c) 2020-2025, JGraph Holdings Ltd
 * Copyright (c) 2020-2025, draw.io AG
 */
function mxFreehand(graph)
{
	// Graph must have a container
	var svgElement = (graph.view != null && graph.view.canvas != null) ? graph.view.canvas.ownerSVGElement : null;
	
	if (graph.container == null || svgElement == null)
	{
		return;
	}
	
	// Stops drawing on escape
	graph.addListener(mxEvent.ESCAPE, mxUtils.bind(this, function()
	{
		this.stopDrawing();
	}));
	
	//Code inspired by https://stackoverflow.com/questions/40324313/svg-smooth-freehand-drawing
	var bufferSize = mxFreehand.prototype.MILD_SMOOTHING;
	var path = null;
	var partPathes = [];
	var strPath;
	var drawPoints = [];
	var partStart = 0; // Index of the current part in drawPoints
	var lastPart;
	var renderThread = null;
	var usePressure = false; // Uses the pressure of the pen instead of simulating it
	var lastPressure = 0.5;
	var closedPath = false; 
	var autoClose = true;
	var autoInsert = true;
	var autoScroll = true;
	var openFill = true;
	var buffer = []; // Contains the last positions of the mouse cursor
	var enabled = false;
	var stopClickEnabled = false;
	var selectInserted = false;
	var currentStrokeColor = 'default';
	var perfectFreehandOptions = {
		size: 5,
		thinning: 0.5,
		smoothing: 0.5,
		streamline: mxFreehand.prototype.getStreamline(mxFreehand.prototype.MILD_SMOOTHING),
	//	easing: (t) => t,
		start: {
		  taper: 0,
	//	  easing: (t) => t,
		  cap: true
		},
		end: {
		  taper: 0,
	//	  easing: (t) => t,
		  cap: true
		}
	};

	var perfectFreehandMode = true;

	this.setClosedPath = function(isClosed)//TODO add closed settings
	{
		closedPath = isClosed;
	};
	
	this.setAutoClose = function(isAutoClose)//TODO add auto closed settings
	{
		autoClose = isAutoClose;
	};

	this.setAutoInsert = function(value)
	{
		autoInsert = value;
	};
	
	this.setAutoScroll = function(value)
	{
		autoScroll = value;
	};
		
	this.setOpenFill = function(value)
	{
		openFill = value;
	};
	
	this.setStopClickEnabled = function(enabled)
	{
		stopClickEnabled = enabled;
	};

	this.setSelectInserted = function(value)
	{
		selectInserted = value;
	};

	// The point averaging buffer of the freehand tool lags behind the pen,
	// so the brush smooths with the streamline of PerfectFreehand instead
	// (see getStreamline). The outline smoothing of the brush has no lag and
	// is always used, as the brush is jagged without it.
	var smoothingValue = mxFreehand.prototype.MILD_SMOOTHING;

	this.setSmoothing = function(smoothing)
	{
		smoothingValue = Math.max(0, smoothing);
		bufferSize = Math.max(mxFreehand.prototype.NO_SMOOTHING, smoothing);
		perfectFreehandOptions.streamline = mxFreehand.prototype.getStreamline(smoothing);
	};

	this.getSmoothing = function()
	{
		return smoothingValue;
	};

	var getBufferSize = function()
	{
		return (perfectFreehandMode) ? mxFreehand.prototype.NO_SMOOTHING : bufferSize;
	};
	
	this.setPerfectFreehandMode = function(value)
	{
		perfectFreehandMode = value;
	};

	this.isPerfectFreehandMode = function()
	{
		return perfectFreehandMode;
	};

	this.setBrushSize = function(value)
	{
		perfectFreehandOptions.size = value;
	};

	this.getBrushSize = function()
	{
		return perfectFreehandOptions.size;
	};

	var doubleTapEnabled = graph.doubleTapEnabled;

	var setEnabled = function(isEnabled)
	{
		// Quick strokes close to each other (eg. handwriting) are not double
		// taps, which would drop the mouse up and join the strokes
		if (isEnabled && !enabled)
		{
			doubleTapEnabled = graph.doubleTapEnabled;
			graph.doubleTapEnabled = false;
		}
		else if (!isEnabled && enabled)
		{
			graph.doubleTapEnabled = doubleTapEnabled;
		}

		enabled = isEnabled;
		graph.getRubberband().setEnabled(!isEnabled);
		graph.graphHandler.setSelectEnabled(!isEnabled);
		graph.graphHandler.setMoveEnabled(!isEnabled);
		graph.panningHandler.setPinchEnabled(!isEnabled);

		if (isEnabled)
		{
			graph.container.classList.add('geFreehandMode');
		}
		else
		{
			graph.container.classList.remove('geFreehandMode');
		}

		graph.fireEvent(new mxEventObject('freehandStateChanged'));
	};
	
	this.startDrawing = function()
	{
		setEnabled(true);
	}
	
	this.isDrawing = function()
	{
		return enabled;
	};

	this.isActive = function()
	{
		return path != null;
	};
	
	var endPath = mxUtils.bind(this, function(e)
	{
	    if (path)
	    {
			if (renderThread != null)
			{
				window.cancelAnimationFrame(renderThread);
				renderThread = null;
			}

			var lastLength = lastPart.length;
		
	    	// Click stops drawing
	    	var doStop = stopClickEnabled && drawPoints.length > 0 &&
	    		lastPart != null && lastPart.length < 2;
			
			if (!doStop)
			{
				drawPoints.push.apply(drawPoints, lastPart);
			}
			
	        lastPart = [];
			drawPoints.push(null);
	        partPathes.push(path);
	        path = null;
	        
			if (doStop || autoInsert)
			{
				this.stopDrawing();
			}
			
			if (autoInsert && (!doStop || lastLength >= 2))
			{
				this.startDrawing();
			}
			
	        mxEvent.consume(e);
	    }
	});

	// Ignores double clicks while drawing as they insert text on the background
	var graphDblClick = graph.dblClick;

	graph.dblClick = function(evt, cell)
	{
		if (enabled)
		{
			mxEvent.consume(evt);
		}
		else
		{
			graphDblClick.apply(this, arguments);
		}
	};

	// Keeps the stroke so far if the system cancels the gesture
	graph.addListener(mxEvent.CANCEL_MOUSE_GESTURE, function(sender, evt)
	{
		endPath(evt.getProperty('event'));
	});

	// Used to retrieve default styles
	var edge = new mxCell();
	edge.edge = true;

	this.getStrokeColor = function(allowDefault)
	{
		var strokeColor = (currentStrokeColor != null) ? currentStrokeColor :
			mxUtils.getValue(graph.currentVertexStyle, mxConstants.STYLE_STROKECOLOR,
			mxUtils.getValue(graph.getCurrentCellStyle(edge),
			mxConstants.STYLE_STROKECOLOR, '#000'))

		if (strokeColor == 'default' && !allowDefault)
		{
			strokeColor = graph.shapeForegroundColor;
		}

		return strokeColor;
	};

	this.setStrokeColor = function(value)
	{
		currentStrokeColor = value;
	};

	this.createStyle = function(stencil)
	{
		var style = ';fillColor=none;';

		if (perfectFreehandMode)
		{
			style = ';lineShape=1;';
		}

		style += 'strokeColor=' + this.getStrokeColor(true) + ';';

		return mxConstants.STYLE_SHAPE + '=' + stencil + style;
	};
	
	this.stopDrawing = function() 
	{
	    if (partPathes.length > 0)
	    {
			if (perfectFreehandMode)
			{
				var tmpPoints = [];
				
				for (var i = 0; i < drawPoints.length; i++) 
				{
					if (drawPoints[i] != null)
					{
						tmpPoints.push(toStrokePoint(drawPoints[i]));
					}
				}

				var output = PerfectFreehand.getStroke(tmpPoints, getStrokeOptions(true));
				drawPoints = [];
				
				for (var i = 0; i < output.length; i++) 
				{
					drawPoints.push({x: output[i][0], y: output[i][1]});
				}
				
				drawPoints.push(null);
			}

	        var maxX = drawPoints[0].x, minX = drawPoints[0].x, maxY = drawPoints[0].y, minY = drawPoints[0].y;
	        
	        for (var i = 1; i < drawPoints.length; i++) 
	        {
	        	if (drawPoints[i] == null) continue;
	        	
	        	maxX = Math.max(maxX, drawPoints[i].x);
	        	minX = Math.min(minX, drawPoints[i].x);
	        	maxY = Math.max(maxY, drawPoints[i].y);
	        	minY = Math.min(minY, drawPoints[i].y);
	        }
	        
	        var w = maxX - minX, h = maxY - minY;

	        if (w > 0 && h > 0)
	        {
		        var xScale = 100 / w;
		        var yScale = 100 / h;
		        
		        drawPoints.map(function(p) 
		        {
		        	if (p == null) return p;
		        	
		        	p.x = (p.x - minX) * xScale;
		        	p.y = (p.y - minY) * yScale;
		        	return p;
		        });
		        
		        //toFixed(2) to reduce size of output
		        var drawShape = '<shape strokewidth="inherit"><foreground>';
		        
		        var start = 0;
		        
		        for (var i = 0; i < drawPoints.length; i++) 
		        {
		        	var p = drawPoints[i];

		        	if (p == null)
	        		{
		        		var tmpClosedPath = false;
				        var startP =  drawPoints[start], endP = drawPoints[i - 1];
				        
				        if (!closedPath && autoClose)
				        {
					        var xdiff = startP.x - endP.x, ydiff = startP.y - endP.y;
					        var startEndDist = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
					        
					        tmpClosedPath = startEndDist <= graph.tolerance;
				        }
				        
				        if (closedPath || tmpClosedPath) 
			        	{
				        	drawShape += '<line x="'+ startP.x.toFixed(2) + '" y="' + startP.y.toFixed(2) + '"/>';
			        	}
				        
		        		drawShape += '</path>' + ((openFill || closedPath || tmpClosedPath)? '<fillstroke/>' : '<stroke/>');
		        		start = i + 1;
	        		}
		        	else if (i == start)
	        		{
		        		drawShape += '<path><move x="'+ p.x.toFixed(2) + '" y="' + p.y.toFixed(2) + '"/>'
	        		}
		        	else
		        	{
		        		drawShape += '<line x="'+ p.x.toFixed(2) + '" y="' + p.y.toFixed(2) + '"/>';
		        	}
		        }
		        
		        drawShape += '</foreground></shape>';

				if (graph.isEnabled() && !graph.isCellLocked(graph.getDefaultParent()))
				{
	                var style = this.createStyle('stencil(' + Graph.compress(drawShape) + ')');
	                var s = graph.view.scale;
	            	var tr = graph.view.translate;
	            	
	                var cell = new mxCell('', new mxGeometry(minX / s - tr.x, minY / s - tr.y, w / s, h / s), style);
	                cell.vertex = 1;
	                
	                graph.model.beginUpdate();
	                try
					{
	                	cell = graph.addCell(cell);
		                
		                graph.fireEvent(new mxEventObject('cellsInserted', 'cells', [cell]));
		                graph.fireEvent(new mxEventObject('freehandInserted', 'cell', cell));
					}
	                finally
					{
	                	graph.model.endUpdate();
					}
					
					if (selectInserted)
					{
						graph.setSelectionCells([cell]);
					}
				}
	        }

	        for (var i = 0; i < partPathes.length; i++)
	        {
	        	partPathes[i].parentNode.removeChild(partPathes[i]);
	        }
	        
	        path = null;
	        partPathes = [];
	        drawPoints = [];
	    }

        setEnabled(false);
	};

	// Stops all shape interactions if freehand is enabled
	graph.addListener(mxEvent.FIRE_MOUSE_EVENT, mxUtils.bind(this, function(sender, evt)
	{
		if (enabled)
		{
			evt.getProperty('event').consume();
		}
	}));

	// Prevents pinch-zoom gestures while freehand drawing is active
	graph.addListener(mxEvent.GESTURE, mxUtils.bind(this, function(sender, evt)
	{
		if (enabled)
		{
			mxEvent.consume(evt.getProperty('event'));
		}
	}));
	
	// Implements a listener for hover and click handling
	graph.addMouseListener(
	{
	    mouseDown: mxUtils.bind(this, function(sender, me)
	    {
			if (graph.isEnabled() && !graph.isCellLocked(graph.getDefaultParent()))
		    {
				var e = me.getEvent();

				// Keeps the last stroke if its mouse up was lost
				if (path != null)
				{
					endPath(e);
				}

				// Ignores gestures that started forced panning (eg. space+drag)
				if (!enabled || mxEvent.isPopupTrigger(e) ||
					mxEvent.isMiddleMouseButton(e) ||
					mxEvent.isMultiTouchEvent(e) ||
					(graph.panningHandler != null &&
					graph.panningHandler.isActive()))
				{
					return;
				}
				
				var strokeWidth = parseFloat(graph.currentVertexStyle[mxConstants.STYLE_STROKEWIDTH] || 1);
				strokeWidth = Math.max(1, strokeWidth * graph.view.scale);
				var strokeColor = this.getStrokeColor();

			    path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			    path.setAttribute('fill', perfectFreehandMode? strokeColor : 'none');
				path.setAttribute('pointer-events', 'none');
			    path.setAttribute('stroke', strokeColor);
			    path.setAttribute('stroke-width', strokeWidth);
			    
			    if (graph.currentVertexStyle[mxConstants.STYLE_DASHED] == '1')
			    {
			    	var dashPattern = graph.currentVertexStyle[mxConstants.STYLE_DASH_PATTERN] || '3 3';
			    	
			    	dashPattern = dashPattern.split(' ').map(function(p)
					{
			    		return parseFloat(p) * strokeWidth;
					}).join(' ');
			    	path.setAttribute('stroke-dasharray', dashPattern);
			    }
			    
			    buffer = [];
			    usePressure = e.pointerType == 'pen' && e.pressure > 0;
			    var pt = getMousePosition(e);
			    appendToBuffer(pt);
			    strPath = 'M' + pt.x + ' ' + pt.y;
			    partStart = drawPoints.length;
			    drawPoints.push(pt);
			    lastPart = [];
			    path.setAttribute('d', perfectFreehandMode?
					PerfectFreehand.getSvgPathFromStroke([toStrokePoint(pt)], getStrokeOptions(false))
					: strPath);
			    svgElement.appendChild(path);
	
				me.consume();
			}
	    }),
	    mouseMove: mxUtils.bind(this, function(sender, me)
	    {
		    if (path != null && graph.isEnabled() &&
				!graph.isCellLocked(graph.getDefaultParent()))
		    {
	    		var e = me.getEvent();

				// Ends the stroke if the pen or mouse was released without a
				// mouse up (eg. a pen hovering over the screen)
				if ((e.pointerType == 'pen' || e.pointerType == 'mouse') && e.buttons === 0)
				{
					endPath(e);
					me.consume();

					return;
				}

				// Uses all positions of the pen since the last event, which
				// the browser merges into one event per frame
				var events = (typeof e.getCoalescedEvents === 'function') ?
					e.getCoalescedEvents() : null;

				if (events == null || events.length == 0)
				{
					events = [e];
				}

				for (var i = 0; i < events.length; i++)
				{
					addPoint(getMousePosition(events[i]));
				}

				var pt = getMousePosition(e);
				scheduleRender();

				if (autoScroll)
				{
					var tr = graph.view.translate;
					graph.scrollRectToVisible(new mxRectangle(pt.x - tr.x, pt.y - tr.y).grow(20));
				}
				
				me.consume();
		    }
	    }),
	    mouseUp: mxUtils.bind(this, function(sender, me)
	    {
			if (path != null && graph.isEnabled() &&
				!graph.isCellLocked(graph.getDefaultParent()))
			{
				addPoint(getMousePosition(me.getEvent()));
				endPath(me.getEvent());
				me.consume();
			}
	    })	
	});

	var getMousePosition = function (e)
	{
	    var pt = mxUtils.convertPoint(graph.container, mxEvent.getClientX(e), mxEvent.getClientY(e));
	    // Mouse up has no pressure
	    pt.p = (!usePressure) ? 0.5 : ((e.pressure > 0) ? e.pressure : lastPressure);
	    lastPressure = pt.p;

	    return pt;
	};

	var toStrokePoint = function (pt)
	{
	    return [pt.x, pt.y, pt.p];
	};

	// The pressure of a pen replaces the pressure that PerfectFreehand
	// simulates from the speed. The last flag ends the stroke at the pen.
	var getStrokeOptions = function (last)
	{
	    var options = mxUtils.clone(perfectFreehandOptions);
	    options.simulatePressure = !usePressure;
	    options.last = last;

	    return options;
	};

	var appendToBuffer = function (pt)
	{
	    buffer.push(pt);

	    while (buffer.length > getBufferSize())
	    {
	        buffer.shift();
	    }
	};

	// Calculate the average point, starting at offset in the buffer
	var getAveragePoint = function (offset)
	{
	    var len = buffer.length;

	    if (len % 2 === 1 || len >= getBufferSize())
	    {
	        var totalX = 0;
	        var totalY = 0;
	        var totalP = 0;
	        var pt, i;
	        var count = 0;

	        for (i = offset; i < len; i++)
	        {
	            count++;
	            pt = buffer[i];
	            totalX += pt.x;
	            totalY += pt.y;
	            totalP += pt.p;
	        }

	        return {
	            x: totalX / count,
	            y: totalY / count,
	            p: totalP / count
	        }
	    }

	    return null;
	};

	// Adds the smoothed position to the part of the path that will not change
	var addPoint = function (pt)
	{
	    appendToBuffer(pt);
	    pt = getAveragePoint(0);

	    if (pt)
	    {
	        drawPoints.push(pt);
	        strPath += ' L' + pt.x + ' ' + pt.y;
	    }
	};

	// Paints the path once per frame as pens send more positions than can be painted
	var scheduleRender = function ()
	{
	    if (renderThread == null)
	    {
	        renderThread = window.requestAnimationFrame(function()
	        {
	            renderThread = null;
	            updateSvgPath();
	        });
	    }
	};

	var updateSvgPath = function ()
	{
	    if (path == null)
	    {
	        return;
	    }

	    // Get the last part of the path (close to the current mouse position)
	    // This part will change if the mouse moves again
	    lastPart = [];

	    for (var offset = 2; offset < buffer.length; offset += 2)
	    {
	        lastPart.push(getAveragePoint(offset));
	    }

	    if (perfectFreehandMode)
	    {
	        var tmpPoints = [];

	        for (var i = partStart; i < drawPoints.length; i++)
	        {
	            tmpPoints.push(toStrokePoint(drawPoints[i]));
	        }

	        for (var i = 0; i < lastPart.length; i++)
	        {
	            tmpPoints.push(toStrokePoint(lastPart[i]));
	        }

	        path.setAttribute('d', PerfectFreehand.getSvgPathFromStroke(
	            tmpPoints, getStrokeOptions(false)));
	    }
	    else
	    {
	        var tmpPath = '';

	        for (var i = 0; i < lastPart.length; i++)
	        {
	            tmpPath += ' L' + lastPart[i].x + ' ' + lastPart[i].y;
	        }

	        // Set the complete current path coordinates
	        path.setAttribute('d', strPath + tmpPath);
	    }
	};
};

/**
 * Returns the streamline of the brush for the given smoothing (0-20).
 * Smoothing 0 still uses a little streamline, which removes the jitter of
 * the pen without a visible lag.
 */
mxFreehand.prototype.getStreamline = function(smoothing)
{
	return 0.2 + 0.4 * Math.min(1, Math.max(0, smoothing) / 20);
};

mxFreehand.prototype.NO_SMOOTHING = 1;
mxFreehand.prototype.MILD_SMOOTHING = 4;
mxFreehand.prototype.NORMAL_SMOOTHING = 8;
mxFreehand.prototype.VERY_SMOOTH_SMOOTHING = 12;
mxFreehand.prototype.SUPER_SMOOTH_SMOOTHING = 16;
mxFreehand.prototype.HYPER_SMOOTH_SMOOTHING = 20;
