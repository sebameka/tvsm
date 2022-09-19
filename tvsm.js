(function() {
	"use strict"

	const Status = {
		"To Be Determined": "TBD",
		"In Development": "Dev",
	}

	const Time = {
		second: 1e3,
		minute: 6e4,
		hour: 36e5,
		day: 864e5,
		week: 6048e5,
		month: 2628e6,
		year: 31536e6,
		months: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
		days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
		max: new Date(864e13),
		min: new Date(-864e13),
	}
	let lastUpdated = (date=> {
		if(date) {
			return new Date(date)
		}
		localStorage.setItem("lastUpdated", new Date(Date.now()))
		return new Date(Date.now())
	})(localStorage.getItem("lastUpdated"))
	document.title = `TVSM Updated ${fromNow(lastUpdated)} ago`

	const _showList = []
	_showList.addListener = (event, handler)=> _showList[`on${event}`] = handler

	const showList = new Proxy(_showList, {
		get: (target, property)=> {
			return {
				push: (value)=> {
					let index = target[property](value)
					target.onadd(value, index)
					target.onchange(0)
					saveChanges()
					return index
				},
				splice: (index, count)=> {
					let removed = target[property](index, count)
					target.onremove(index, count, removed)
					target.onchange(1)
					saveChanges()
					return removed
				},
				sort: (call)=> {
					let sorted = target[property](call)
					target.onsort(sorted, call)
					target.onchange(0)
					saveChanges()
					return sorted
				}
			}[property]||target[property]
		},
		set: (target, property, value)=> {
			if(property != "length") {
				target[property] = value
				target.onedit(value, parseInt(property))
				saveChanges()
			}
			return true
		}
	})

	document.onreadystatechange = ()=> 
	document.readyState=="interactive"&&(()=>{
		let content = document.querySelector(".content")
		let p = document.querySelector("p")
		let form = document.querySelector("form")
		let input = document.querySelector("input")
		let lists = document.querySelectorAll("ul")
		let [,foundUl,showCols,showUl] = lists
		let selMenu = document.querySelector("#sel-menu")
		let selShows = {
			remove: selMenu.querySelector("button"),
			update: selMenu.querySelector("button:last-child"),
			text: selMenu.querySelector("div"),
		}
		
		const changeEvent = new Event("change")
		let mouseDown = 0
		let selected = 0
		let lastTimeout

		NodeList.prototype.reduce = Array.prototype.reduce

		showList.addListener("change", delay=> {
			clearTimeout(lastTimeout)
			lastTimeout = timeout(()=> 
				showUl.childNodes.forEach((show, i)=>
					show.querySelector("p").innerText = (i+1+'').padStart(2, 0)), delay)
		})
		showList.addListener("add", (show, i)=> {
			let label = showFull(show)
			showUl.appendChild(label)
			label.classList.add("added")
			timeout(()=> label.classList.remove("added"))
		})
		showList.addListener("edit", (show, i)=> {
			let label = showFull(show)
			let old = showUl.children[i]
			label.querySelector("p").replaceWith(old.querySelector("p"))
			label.querySelector("input").checked = old.querySelector("input").checked
			
			let oldContent = getDivs(old)
			getDivs(label).forEach((div, i)=> {
				if(oldContent[i].innerText != div.innerText)
					div.classList.add("changed")
			})
			
			old.replaceWith(label)
			label.classList.add("updated")
			timeout(()=> label.classList.remove("updated"))
		})
		showList.addListener("sort", sorted=> {
			let shows = Object.values(showUl.childNodes)
			shows.forEach(show=>show.remove())
			sorted.forEach(show=> showUl.appendChild(shows.find(match=> match.id == show.id)))
		})
		showList.addListener("remove", (index, count)=> {
			let shows = showUl.childNodes
			for(let show = shows[index]; count; show = shows[++index]) {
				show.className = "removed"
				timeout(()=> show.remove())
				count--
			}
		})

		p.onclick = setupList
		selShows.remove.onclick = removeShows
		selShows.update.onclick = ()=> {
			showUl.childNodes.reduce((ids, show, i)=> {
				if(show.querySelector("input").checked) {
					ids.push([show.id, i])
				} return ids
			}, []).forEach((id, i)=> 
				timeout(searchShowByID(
					updated=> { showList[id[1]] = getShowInfo(updated) }, id[0]), i))
		}

		const sortBy = {};
		["name", "network", "status"].forEach(property=> {
			sortBy[property] = reverse=> showList.sort((a, b)=>
				reverse ? a[property] < b[property] : a[property] > b[property])
		});
		["seasons", "rating"].forEach(property=> {
			sortBy[property] = reverse=> showList.sort((a, b)=>
				reverse ? a[property] > b[property] : a[property] < b[property])
		});
		["next", "prev"].forEach(property=> {
			sortBy[property] = reverse=> showList.sort((a, b)=> 
				reverse ? closestToNow(a[property].date.getTime(), b[property].date.getTime()) : 
					closestToNow(b[property].date.getTime(), a[property].date.getTime()))
		});
		
		const cols = ["name", "next", "prev", "network", "status", "seasons", "rating"]
		showCols.querySelectorAll("div").forEach((col, i)=> {
			let property = cols[i]
			col.onclick = ()=> {
				let sorted = showCols.getAttribute("sortBy") == property
				sortBy[property](sorted)
				showCols.setAttribute("sortBy", sorted && "none" || property)
			}
		})

		input.oninput = ()=> {
			clearNode(foundUl)
			clearTimeout(lastTimeout)
			let msg = input.value.trim()
			if(!msg||msg[0]=='#') return
			lastTimeout = timeout(showSearch(shows=>{
				if(!shows.length) return
				shows.forEach(match=> foundUl.appendChild(showPreview(getShowInfo(match.show))))
				foundUl.firstChild.firstChild.checked = true
			},msg))
		}

		(function setView(savedShows) {
			if(!savedShows) {
				form.onsubmit = ()=> {
					addShows()
					timeout(()=> showList.length&&setupList()&&(form.onsubmit = addShows),3)
					return false
				}
			}
			else {
				JSON.parse(savedShows).forEach(show=> {
					show.next.date = new Date(show.next.date)
					show.prev.date = new Date(show.prev.date)
					show.premiered = new Date(show.premiered)
					showList.push(show)
				})
				setupList()
				form.onsubmit = addShows
			}	
		})(localStorage.getItem("showList"))

		document.body.onmousedown = e=> {
			mouseDown=e.which
		}
		document.body.onmouseup = ()=> {
			mouseDown=0
		}

		function setupList() {
			let update = updateButton()
			content.style.justifyContent = "normal"
			p.remove()
			lists.forEach(ul=>ul.hidden = false)
			form.classList.add("navbar")
			form.querySelector(".input-wrapper").insertAdjacentElement("afterbegin", update)
			update.querySelector("button").onclick = ()=> {
				showList.forEach((element,i)=> {
					timeout(searchShowByID(show=> { showList[i] = getShowInfo(show) }, element.id), i)
				})
				timeout(()=> {
					lastUpdated = new Date(Date.now())
					localStorage.setItem("lastUpdated", lastUpdated)
					document.title = `TVSM Updated ${fromNow(lastUpdated)} ago`
				}, showList.length)
			}
			return true
		}

		function addShows() {
			function addToList(show) {
				let i = showList.findIndex(current=> current.id==show.id)
				show = getShowInfo(show)
				i == -1&&showList.push(show)||(showList[i] = show)
			}
			if(input.value.trim()[0] == '#') {
				let names = input.value.slice(1).split(",")
				names.forEach((name,i)=> timeout(singleShowSearch(addToList, name), i))
				input.value = ""
			}
			else {
				foundUl.childNodes.forEach((match,i)=>
					match.firstChild.checked && timeout(searchShowByID(addToList, match.id), i)
				)
				foundUl.firstChild&&!(input.value = "")&&clearNode(foundUl)
			}
			return false
		}
		function removeShows() {
			let shows = showUl.childNodes.reduce((index, show, i)=> {
				show.firstChild.checked&&index.push(i)
				return index
			}, [])

			shows.reverse().reduce((total, index, i, src)=> {
				if(i == src.length - 1) {
					showList.splice(index, total)
				}
				else if(index == src[i+1] + 1) {
					return ++total
				}
				else {
					showList.splice(index, total)
				}
				return 1
			}, 1)
			selMenu.style.display = "none"
			selected = 0
		}


		function createShow(show, tooltips) {
			let label = document.createElement("label")
			let input = document.createElement("input")
			let li = document.createElement("li")
			let name = document.createElement("div")
			let network = document.createElement("div")
			let status = document.createElement("div")
			let rating = document.createElement("div")

			input.type = "checkbox"
			input.hidden = true

			if(tooltips) {
				name.title = "Name"
				network.title = "Network"
				status.title = "Status"
				rating.title = "Rating"
			}
			name.innerHTML = `<div>${show.name}</div>`
			network.innerText = show.network
			status.innerText = show.status
			rating.innerText = show.rating&&show.rating.toFixed(1)||'—'

			label.appendChild(input)
			label.appendChild(li)
			li.appendChild(name)
			li.appendChild(network)
			li.appendChild(status)
			li.appendChild(rating)

			label.id = show.id
			label.onmouseover = ()=> {
				if(mouseDown == 1) {
					input.checked ^= true
					input.dispatchEvent(changeEvent)
				}
			}
			label.onmousedown = e=> {
				if(e.which == 1) {
					input.checked ^= true
					input.dispatchEvent(changeEvent)
				}
			}
			label.onclick = ()=> false

			return li
		}
		function showPreview(show) {
			let li = createShow(show, true)
			let premiered = document.createElement("div")

			premiered.title = "Premiere date"
			premiered.innerText = getDate(show.premiered)

			li.insertBefore(premiered, li.children[1])
			return li.parentElement
		}
		function showFull(show) {
			let li = createShow(show)
			let index = document.createElement("p")
			let next = document.createElement("div")
			let nextDate = document.createElement("div")
			let nextEp = document.createElement("p")
			let prev = document.createElement("div")
			let prevDate = document.createElement("div")
			let prevEp = document.createElement("p")
			let seasons = document.createElement("div")

			nextDate.innerText = getDate(show.next.date)
			prevDate.innerText = getDate(show.prev.date)
			nextEp.innerText = show.next.ep
			prevEp.innerText = show.prev.ep
			seasons.innerText = show.seasons

			nextDate.onmouseenter = ()=> nextDate.innerText = getDate(show.next.date, true)
			nextDate.onmouseleave = ()=> nextDate.innerText = getDate(show.next.date)
			prevDate.onmouseenter = ()=> prevDate.innerText = getDate(show.prev.date, true)
			prevDate.onmouseleave = ()=> prevDate.innerText = getDate(show.prev.date)

			nextEp.onmouseenter = ()=> nextEp.innerText = show.next.left
			nextEp.onmouseleave = ()=> nextEp.innerText = show.next.ep
			prevEp.onmouseenter = ()=> prevEp.innerText = show.prev.left
			prevEp.onmouseleave = ()=> prevEp.innerText = show.prev.ep

			next.appendChild(nextDate)
			next.appendChild(nextEp)
			prev.appendChild(prevDate)
			prev.appendChild(prevEp)

			li.parentElement.querySelector("input").onchange = ev=> {
				if((selected += ev.target.checked||-1)) {
					selMenu.style.display = "flex"
					selShows.text.innerText = `${selected} Show${selected>1&&"s"||""} selected`
				}
				else {
					selMenu.style.display = "none"
				}
			}

			li.firstChild.insertAdjacentElement("afterbegin", index)
			li.insertBefore(next, li.children[1])
			li.insertBefore(prev, li.children[2])
			li.insertBefore(seasons, li.children[5])

			return li.parentElement
		}
	})()

	function getDivs(label) {
		return label.querySelectorAll("div").reduce((divs, div, i)=> {
			if(i!=0 && i!=2 && i!=4) divs.push(div)
			return divs
		}, [])
	}
	function updateButton() {
		let div = document.createElement("div")
		let button = document.createElement("button")

		button.innerText = "Update all"
		button.type = "button"
		div.appendChild(button)

		return div
	}
	function getShowInfo(json) {
		return {
			id: json.id,
			name: json.name,
			network: json.network&&json.network.name||json.webChannel&&json.webChannel.name||'—',
			status: Status[json.status]||json.status||'—',
			rating: json.rating&&json.rating.average||0,
			premiered: json.premiered&&new Date(`${json.premiered}T00:00:00`)||Time.min,
			...getEmbeddedInfo(json),
		}
	}
	function getEmbeddedInfo(json) {
		const info = {
			next: {ep: 'TBD', date: Time.min, left: "SECRET"},
			prev: {ep: 'TBD', date: Time.min, left: "SECRET"},
			seasons: '—',
		}
		if(!json._embedded) {return info}
		
		info.seasons = json._embedded.seasons.length;
		[{short: "next", long: "nextepisode"}, {short: "prev", long: "previousepisode"}]
		.forEach(prop=> {
			let season, ep, current
			if((current = json._embedded[prop.long])) {
				info[prop.short].ep = getEp((season = current.season), (ep = current.number))
				info[prop.short].date = new Date(current.airstamp)
			}
			else if((current = json._embedded.previousepisode) && info.seasons > current.season) {
				info[prop.short].ep = getEp((season = current.season+1), (ep = 1))
			}
			if(season && (current = json._embedded.seasons[season-1].episodeOrder)) {
				let remaining = current - ep
				info[prop.short].left = remaining&&remaining+" LEFT"||"LAST"
			}
		})
		
		info.seasons = pad0s(info.seasons)

		return info
	}

	function saveChanges() {
		localStorage.setItem("showList", JSON.stringify(_showList))
	}
	function pad0s(n, padding = 2) {
		return (n+'').padStart(padding, 0)
	}
	function addS(str, n) {
		return `${str}${n > 1 && 's' || ''}`
	}
	function getEp(ss, ep) {
		return `S${pad0s(ss)}E${pad0s(ep)}`
	}
	function fromNow(then) {
		const elapsed = Math.abs(Date.now() - then)
		if(elapsed < Time.second) return `${elapsed}ms`

		let secs = elapsed/Time.second|0
		if(elapsed < Time.minute) return `${pad0s(secs)} ${addS("second",secs)}`

		let mins = secs/60|0
		if(elapsed < Time.hour) return `${pad0s(mins)}:${pad0s(secs%60)} ${addS("minute",mins)}`

		let hours = secs/3600|0
		mins = mins%60
		if(elapsed < Time.day) return `${pad0s(hours)}:${pad0s(mins)} ${addS("hour",hours)}`

		let days = secs/86400|0
		if(elapsed < Time.week) {
			hours %= 24
			if(hours) return `${pad0s(days)} ${addS("day",days)} ${pad0s(hours)} ${addS("hour",hours)}`
			return `${pad0s(days)} ${addS("day",days)}`
		}

		let weeks = secs/604800|0
		if(elapsed < Time.month) {
			days %= 7
			if(days) return `${pad0s(weeks)} ${addS("week",weeks)} ${pad0s(days)} ${addS("day",days)}`
			return `${pad0s(weeks)} ${addS("week",weeks)}`
		}

		let months = secs/2628000|0
		console.log(days)
		if(elapsed < Time.year) {
			days = days%30.42|0
			if(days) return `${pad0s(months)} ${addS("month",months)} ${pad0s(days)} ${addS("day",days)}`
			return `${pad0s(months)} ${addS("month",months)}`
		}

		let years = secs/31536e3|0
		months %= 12
		days = days % 365 % 31
		let result = `${pad0s(years)} ${addS("year",years)}`
		if(months) result += ` ${pad0s(months)} ${addS("month",months)}`
		if(days) result += ` ${pad0s(days)} ${addS("day",days)}`
		return result
	}
	function getDate(date, reverse = false) {
		if(invalidDate(date)) return '—'
		if((Math.abs(Date.now() - date.getTime()) <= Time.week) - reverse) return Time.days[date.getDay()]
		return `${(date.getDate()+'').padStart(2, 0)} ${Time.months[date.getMonth()]} ${(date.getFullYear()+'').slice(-2)}`
	}
	function invalidDate(date) {
		return date.getTime() == Time.max.getTime() || date.getTime() == Time.min.getTime()
	}
	function closestToNow(a, b) {
		let now = Date.now()
		return Math.abs(b - now) - Math.abs(a - now)
	}
	function clearNode(parent) {
		while(parent.firstChild && !parent.firstChild.remove());
	}
	function timeout(callback, delay=1) {
		return setTimeout(callback, delay*333)
	}
	function jsonRequest(url, callback) {
		fetch(url)
			.then(r=>r.status==200&&r.json()).then(json=>{
				callback(json)
			}
		)
		return true
	}


	const extraContent = "embed[]=nextepisode&embed[]=previousepisode&embed[]=seasons"
	function showSearch(callback=()=>{}, show="") {
		return ()=>
		jsonRequest(`https://api.tvmaze.com/search/shows?q=${show}`, callback)
	}
	function singleShowSearch(callback=()=>{}, show="") {
		return ()=> 
		jsonRequest(`https://api.tvmaze.com/singlesearch/shows?q=${show}&${extraContent}`, callback)
	}
	function searchShowByID(callback=()=>{}, id=0) {
		return ()=>
		jsonRequest(`https://api.tvmaze.com/shows/${id}?${extraContent}`, callback)
	}
})()