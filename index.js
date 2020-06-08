function Socket(url) {
  this.pendingCount = 0
  this.pendingCallbacks = {}
  this.reconnecting = false
  this.url = url

  this.options = {
    'reconnection_delay': 2000,
    'reconnection_limit': 5000,
    'max_reconnection_attempts': 10,
  }

  this.connect()
}

Socket.prototype.emit = function(event, data, cb) {
  const payload = {
    e: event,
    d: data,
  }

  if (cb) {
    this.pendingCount++
    this.pendingCallbacks[this.pendingCount] = cb
    payload.c = this.pendingCount
  }

  this.socket.send(JSON.stringify(payload))
}

Socket.prototype.connect = function() {
  const self = this
  this.socket = new WebSocket(this.url)
  this.socket.onopen = function() {
    self.trigger('connect')
  }
  this.socket.onclose = function() {
    self.reconnecting || self.trigger('disconnect')
  }
  this.socket.onerror = function(error) {
    self.trigger('error', error)
  }
  this.socket.onmessage = function(message) {
    self.onMessage(message)
  }
}

Socket.prototype.reconnect = function() {
  if (this.reconnecting) return

  const self = this
  const delay = this.options['reconnection_delay']
  const limit = this.options['reconnection_limit']

  let attempt = this.options['max_reconnection_attempts']

  this.reconnecting = true

  function reconnect(attempt, delay, limit) {
    if (!self.reconnecting) return

    self.on('connect', onConnect)
    self.reconnecting = true
    self.socket.close()
    self.connect()

    setTimeout(function() {
      if (!self.reconnecting) return
      if (!attempt) return self.trigger('reconnect_failed')
      if (self.socket.readyState != 1) {
        self.off('connect', onConnect)
        reconnect(--attempt, Math.min(delay * 2, limit), limit)
      }
    }, delay)
  }

  function onConnect() {
    self.trigger('reconnect')
    self.reconnecting = false
  }

  reconnect(--attempt, delay, limit)
}

Socket.prototype.onMessage = function(message) {
  try {
    message = JSON.parse(message.data)
  } catch(e) {
    console.error('Message parsing failed', message)
    return
  }

  const event = message.e
  const data = message.d || {}
  const callback = message.c

  if (callback) {
    this.pendingCallbacks[callback](data)
    delete this.pendingCallbacks[callback]
  }
  if (event) {
    this.trigger(event, data)
  }
}

// Bind an event to a `callback` function. Passing `"all"` will bind
// the callback to all events fired.
Socket.prototype.on = function(name, callback, context) {
  if (!callback) return this
  this._events || (this._events = {})
  var events = this._events[name] || (this._events[name] = [])
  events.push({callback: callback, context: context, ctx: context || this})
  return this
}

// Remove one or many callbacks. If `context` is null, removes all
// callbacks with that function. If `callback` is null, removes all
// callbacks for the event. If `name` is null, removes all bound
// callbacks for all events.
Socket.prototype.off = function(name, callback, context) {
  var retain, ev, events, names, i, l, j, k
  if (!this._events) return this
  if (!name && !callback && !context) {
    this._events = {}
    return this
  }

  names = name ? [name] : Object.keys(this._events)
  for (i = 0, l = names.length; i < l; i++) {
    name = names[i]
    if (events = this._events[name]) {
      this._events[name] = retain = []
      if (callback || context) {
        for (j = 0, k = events.length; j < k; j++) {
          ev = events[j]
          if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
              (context && context !== ev.context)) {
            retain.push(ev)
          }
        }
      }
      if (!retain.length) delete this._events[name]
    }
  }

  return this
}

// Trigger one or many events, firing all bound callbacks. Callbacks are
// passed the same arguments as `trigger` is, apart from the event name
// (unless you're listening on `"all"`, which will cause your callback to
// receive the true name of the event as the first argument).
Socket.prototype.trigger = function(name) {
  if (!this._events) return this
  var args = [].slice.call(arguments, 1)
  var events = this._events[name]
  var allEvents = this._events.all
  if (events) triggerEvents(events, args)
  if (allEvents) triggerEvents(allEvents, arguments)
  return this
}

// A difficult-to-believe, but optimized internal dispatch function for
// triggering events. Tries to keep the usual cases speedy (most internal
// Backbone events have 3 arguments).
const triggerEvents = function(events, args) {
  var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2]
  switch (args.length) {
    case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return
    case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return
    case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return
    case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return
    default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args)
  }
}

module.exports = Socket
