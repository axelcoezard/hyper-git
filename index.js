
exports.decorateConfig = (config) => {
	return Object.assign({}, config, {
		css: `
			${config.css || ''}
			.terms_terms {
				margin-right: 300px;
			}
		`
	});
};

let pid;
let cwd;
let git = {
    branch: '',
    remote: ''
}

const setCwd = (pid, action) => {
	const { exec } = require('child_process');

	if (process.platform == 'win32') {
		let directoryRegex = /([a-zA-Z]:[^\:\[\]\?\"\<\>\|]+)/mi;
		if (action && action.data) {
			let path = directoryRegex.exec(action.data);
			if(path){
				cwd = path[0];
			}
		}
	} else {
		exec(`lsof -p ${pid} | awk '$4=="cwd"' | tr -s ' ' | cut -d ' ' -f9-`, (err, stdout) => {
			cwd = stdout.trim();
		});
	}
};

exports.middleware = (store) => (next) => (action) => {
    const uids = store.getState().sessions.sessions;

    switch (action.type) {
        case 'SESSION_SET_XTERM_TITLE':
            pid = uids[action.uid].pid;
            break;

        case 'SESSION_ADD':
            pid = action.pid;
            setCwd(pid);
            break;

        case 'SESSION_ADD_DATA':
            const { data } = action;
            const enterKey = data.indexOf('\n') > 0;

            if (enterKey) {
                setCwd(pid, action);
            }
            break;

        case 'SESSION_SET_ACTIVE':
            pid = uids[action.uid].pid;
            setCwd(pid);
            break;
    }

    next(action);
};

exports.decorateHyper = (Hyper, { React }) => {
	return class extends React.Component {
		constructor(props) {
			super(props);
			this.state = {
				cwd: '',
				branches: [],
				currentBranch: '',
				currentRemote: '',
				commitMessage: '',
				dirty: false,
			};
		}

		componentDidMount() {
			this.fetchBranches();

			this.interval = setInterval(() => {
				const oldCwd = this.state.cwd;

				this.setState({
					dirty: oldCwd !== cwd,
					cwd: cwd,
					currentBranch: git.branch,
					currentRemote: git.remote,
				});

				if (this.state.dirty) {
					this.setState({ dirty: false });
					this.fetchBranches();
				}
			}, 100);
		}

		componentWillUnmount() {
			clearInterval(this.interval);
		}

		fetchBranches = async () => {
			const { exec } = require('child_process');
			exec('git branch', (err, stdout) => {
				if (!err) {
					const branches = stdout
						.split('\n')
						.map((b) => b.trim())
						.filter((b) => b.length > 0);
					const currentBranch = branches.find((b) => b.startsWith('*')).replace('* ', '');
					this.setState({ branches, currentBranch });
					console.log('Branches fetched', branches);
				}
				console.log('Error fetching branches', err);
			});
		};

		componentDidMount() {
			console.log('Component mounted');
			this.fetchBranches();
		}

		checkoutBranch = (branch) => {
			const { exec } = require('child_process');
			exec(`git checkout ${branch}`, (err) => {
				if (!err) {
					this.setState({ currentBranch: branch });
					this.fetchBranches();
				}
			});
		};

		handleCommit = () => {
			const { exec } = require('child_process');
			const { commitMessage } = this.state;
			if (commitMessage.trim()) {
				exec(`git commit -m "${commitMessage}"`, (err) => {
					if (!err) alert('Commit successful!');
				});
			}
		};

		render() {
			const { customChildren } = this.props
			const existingChildren = customChildren ? customChildren instanceof Array ? customChildren : [customChildren] : [];

			const { branches, currentBranch, commitMessage } = this.state;

			return React.createElement(
				'div',
				{
					style: {
						display: 'flex',
						width: '100%',
						height: '100%',
					},
				},
				React.createElement(
					'div',
					{
						style: {
							flex: '1',
							width: 'calc(100% - 300px)',
							height: '100%',
						},
					},
					React.createElement(Hyper, this.props),
				),
				React.createElement(
					'div',
					{
						style: {
							width: '300px',
							height: '100vh',
							overflowY: 'auto',
							background: '#2c2c2c',
							color: '#fff',
							padding: '10px',
							boxSizing: 'border-box', // Ensures padding doesn't affect width
							borderLeft: '1px solid #444', // Optional: visual separation
						},
					},
					React.createElement('h3', null, 'Git Panel'),
					React.createElement('h4', null, `Current Branch: ${currentBranch}`),
					React.createElement(
						'select',
						{
							value: currentBranch,
							onChange: (e) => this.checkoutBranch(e.target.value),
							style: { width: '100%', marginBottom: '10px' },
						},
						branches.map((branch) =>
							React.createElement('option', { key: branch, value: branch }, branch)
						)
					),
					React.createElement(
						'button',
						{
							onClick: () => this.fetchBranches(),
							style: { width: '100%', marginBottom: '10px' },
						},
						'Fetch'
					),
					React.createElement('textarea', {
						value: commitMessage,
						onChange: (e) => this.setState({ commitMessage: e.target.value }),
						placeholder: 'Commit message',
						style: { width: '100%', height: '60px', marginBottom: '10px' },
					}),
					React.createElement(
						'button',
						{
							onClick: this.handleCommit,
							style: { width: '100%' },
						},
						'Commit'
					)
				)
			);
		}
	};
};
