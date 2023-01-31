const express = require('express')
const app = express()
const http = require('http')
const server = http.createServer(app)
const { Server } = require('socket.io')
const Filter = require('bad-words')
const io = new Server(server, {
	cors: {
		origin: '*',
	},
})

// let game = {
// 	users: [],
// 	task: {},
// 	finishers: [],
// 	gameId: Math.floor(100000 + Math.random() * 900000),
// 	host: {
// 		name: filter.clean(userData.name),
// 		uid: userData.uid,
// 		sid: socket.id,
// 	},
//  canJoin: true,
// }

let activeGames = []
let filter = new Filter()

app.get('/', (req, res) => {
	res.send(
		JSON.stringify({
			online: true,
			connected: true,
		})
	)
})

app.get('/status', (req, res) => {
	res.send(
		JSON.stringify({
			online: true,
		})
	)
})

io.on('connection', (socket) => {
	socket.on('hostingGameCreate', (userData, callback) => {
		let game = {
			users: [],
			task: {},
			finishers: [],
			gameId: Math.floor(100000 + Math.random() * 900000),
			host: {
				name: filter.clean(userData.name),
				uid: userData.uid,
				sid: socket.id,
			},
			canJoin: true,
		}
		let checker = activeGames.filter((i) => i.gameId == game.gameId)
		while (checker.length > 0) {
			game['gameId'] = Math.floor(100000 + Math.random() * 900000)
			checker = activeGames.filter((i) => i.gameId != game.gameId)
		}
		activeGames.push(game)
		socket.join(game.gameId)
		callback(game)
	})

	socket.on('playerJoinGame', (gameId, userData, callback) => {
		try {
			parseInt(gameId)
		} catch {
			callback({ ok: false })
			return
		}

		let index = activeGames.findIndex((i) => i.gameId == gameId)
		if (index > -1) {
			if (activeGames[index].canJoin) {
				activeGames[index].users.push({
					name: filter.clean(userData.name),
					uid: userData.uid,
					sid: socket.id,
				})
				socket.join(activeGames[index].gameId)
				io.to(activeGames[index].gameId).emit('updateUserListHost', activeGames[index])
				callback({ ok: true, game: activeGames[index] })
			} else {
				callback({ ok: false })
			}
		} else {
			callback({ ok: false })
		}
	})

	socket.on('hostSelectingGame', (game, callback) => {
		let id = game.gameId
		let index = activeGames.findIndex((i) => i.gameId == id)
		activeGames[index]['canJoin'] = false
		io.to(id).emit('playerSelectingGame', activeGames[index])
		callback(activeGames[index])
	})

	socket.on('hostStartGame', (activeTask, game) => {
		let index = activeGames.findIndex((i) => i.gameId == game.gameId)
		activeGames[index].task = activeTask
		io.to(game.gameId).emit('playerStartGame', activeTask, activeGames[index])
	})

	socket.on('playerCompletedTask', (task, game, userData, callback) => {
		let index = activeGames.findIndex((i) => i.gameId == game.gameId)

		activeGames[index].finishers.push({
			name: userData.name,
			sid: socket.id,
			uid: userData.uid,
			task,
		})

		io.to(game.gameId).emit('updateUserListHost', activeGames[index])

		callback(activeGames[index])
	})

	socket.on('resetGame', (game) => {
		let index = activeGames.findIndex((i) => i.gameId == game.gameId)
		// finishers reset, cnajoin true, task gone
		activeGames[index].finishers = []
		activeGames[index].canJoin = true
		activeGames[index].task = {}
		io.to(game.gameId).emit('playerResetGame', activeGames[index])
	})

	socket.on('disconnecting', () => {
		let game = undefined
		let rooms = [...socket.rooms]
		if (rooms[1]) {
			// they are in a game room
			let index = activeGames.findIndex((i) => i.gameId == rooms[1])
			if (index > -1) {
				// there is a game for the room
				game = activeGames[index]
				if (activeGames[index].host.sid === socket.id) {
					// user is host
					activeGames.splice(index, 1)
					io.to(game.gameId).emit('leaveGameEnd')
				} else {
					// user is player
					let userIndex = game.users.findIndex((i) => i.sid == socket.id)
					if (userIndex > -1) {
						// user exists
						activeGames[index].users.splice(userIndex, 1)
						io.to(activeGames[index].gameId).emit('updateUserListHost', activeGames[index])
					}
				}
			}
		}
	})
})

let port = process.env.PORT || 3000
server.listen(port, () => {
	console.log('listening on port ' + port)
})
